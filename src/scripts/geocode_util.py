"""Standalone, robust geocoding utility for JobMap.

Supports:
- Mapbox Places Geocoding API with disk & memory caching
- US Census Geocoder API (free unlimited fallback without API key)
- Address cleaning & US metro normalization
- Bounding-box validation for US territories
- CLI usage for one-off and batch address conversion
"""

import argparse
import json
import os
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote
import requests

# Bounding box for USA (including Alaska, Hawaii, Puerto Rico)
US_MIN_LNG, US_MAX_LNG = -171.0, -66.0
US_MIN_LAT, US_MAX_LAT = 18.0, 72.0

CACHE_FILE = Path(__file__).resolve().parent / "geocode_cache.json"
_MEMORY_CACHE: dict[str, list[float] | None] = {}


def _load_cache() -> None:
    global _MEMORY_CACHE
    if CACHE_FILE.is_file():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                _MEMORY_CACHE = json.load(f)
        except Exception:
            _MEMORY_CACHE = {}


def _save_cache() -> None:
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_MEMORY_CACHE, f, indent=2)
    except Exception:
        pass


_load_cache()


def normalize_address(address: str) -> str:
    """Clean and standardize an address string."""
    if not address:
        return ""
    text = unicodedata.normalize("NFKD", str(address))
    text = text.encode("ascii", "ignore").decode("ascii").strip()

    # Remove typical job scraper fluff
    text = re.sub(r"(?i)\b(remote in|hybrid in|onsite in|greater|metro area|area)\b", "", text)
    text = re.sub(r"(?i)\b(united states|usa|u\.s\.a\.|us)\b", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.-")
    return text


def is_valid_us_coords(lng: float, lat: float) -> bool:
    """Verify that coordinates fall within the broad US boundary."""
    return US_MIN_LNG <= lng <= US_MAX_LNG and US_MIN_LAT <= lat <= US_MAX_LAT


def geocode_with_mapbox(address: str, token: str) -> list[float] | None:
    """Query Mapbox Places API for coordinates [lng, lat]."""
    clean = normalize_address(address)
    if not clean or not token:
        return None

    cache_key = clean.lower()
    if cache_key in _MEMORY_CACHE:
        return _MEMORY_CACHE[cache_key]

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(clean)}.json"
    params = {
        "access_token": token,
        "limit": 1,
        "country": "us",
        "types": "place,locality,neighborhood,address,postcode,poi",
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        features = data.get("features", [])
        if features:
            center = features[0].get("center")
            if center and len(center) == 2:
                lng, lat = float(center[0]), float(center[1])
                if is_valid_us_coords(lng, lat):
                    coords = [lng, lat]
                    _MEMORY_CACHE[cache_key] = coords
                    _save_cache()
                    return coords
    except Exception as error:
        print(f"Mapbox geocode error for '{clean}': {error}")

    return None


def geocode_with_census(address: str) -> list[float] | None:
    """Fallback: query free US Census Bureau Geocoder API."""
    clean = normalize_address(address)
    if not clean:
        return None

    cache_key = f"census_{clean.lower()}"
    if cache_key in _MEMORY_CACHE:
        return _MEMORY_CACHE[cache_key]

    url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    params = {
        "address": clean,
        "benchmark": "Public_AR_Current",
        "format": "json",
    }
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        matches = data.get("result", {}).get("addressMatches", [])
        if matches:
            coords_dict = matches[0].get("coordinates", {})
            lng = float(coords_dict.get("x", 0))
            lat = float(coords_dict.get("y", 0))
            if is_valid_us_coords(lng, lat):
                coords = [lng, lat]
                _MEMORY_CACHE[cache_key] = coords
                _save_cache()
                return coords
    except Exception as error:
        print(f"Census geocode notice for '{clean}': {error}")

    return None


def geocode(address: str, mapbox_token: str | None = None) -> list[float] | None:
    """Primary entry point: attempts Mapbox first, falls back to Census."""
    token = mapbox_token or os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN")
    if token:
        coords = geocode_with_mapbox(address, token)
        if coords:
            return coords

    return geocode_with_census(address)


def reverse_geocode(lng: float, lat: float, mapbox_token: str | None = None) -> str | None:
    """Return a human-readable place name for coordinates."""
    token = mapbox_token or os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN")
    if not token:
        return None

    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json"
    params = {"access_token": token, "limit": 1, "types": "place,locality,region"}
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        features = res.json().get("features", [])
        if features:
            return str(features[0].get("place_name", ""))
    except Exception:
        pass
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JobMap Geocoding Utility")
    parser.add_argument("address", nargs="?", help="Address, city, or place to geocode")
    parser.add_argument("--reverse", nargs=2, type=float, metavar=("LNG", "LAT"), help="Reverse geocode coordinates")
    args = parser.parse_args()

    if args.reverse:
        place = reverse_geocode(args.reverse[0], args.reverse[1])
        print(f"Coords {args.reverse} -> {place or 'Unknown'}")
    elif args.address:
        result = geocode(args.address)
        print(f"'{args.address}' -> {result}")
    else:
        parser.print_help()
