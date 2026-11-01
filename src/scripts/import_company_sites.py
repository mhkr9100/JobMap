"""Import local business/building GeoJSON into the persistent organization registry.

Accepts a regional GeoJSON extract so bulk discovery does not overload public
geocoding/Overpass servers. For OpenStreetMap-derived data, retain attribution
and comply with ODbL when distributing the resulting database.

Usage: python src/scripts/import_company_sites.py /path/to/st-louis.geojson --source osm
Expected feature properties include a name/company, OSM source ID, address and
optional website/logo. Polygon footprints are reduced to a centroid for storage.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from supabase import Client, create_client

from harvest_jobs import (
    LAUNCH_RADIUS_METERS,
    LAUNCH_CENTER,
    UPLOAD_BATCH_SIZE,
    _normalized_text,
    _postgis_point,
    _within_launch_radius,
)


def _load_env() -> None:
    env_file = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def _client() -> Client:
    _load_env()
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local or the environment.")
    return create_client(url, key)


def _area_centroid(ring: list[list[float]]) -> tuple[float, float] | None:
    if len(ring) < 4:
        return None
    twice_area = 0.0
    x_sum = 0.0
    y_sum = 0.0
    for first, second in zip(ring, ring[1:]):
        cross = first[0] * second[1] - second[0] * first[1]
        twice_area += cross
        x_sum += (first[0] + second[0]) * cross
        y_sum += (first[1] + second[1]) * cross
    if abs(twice_area) < 1e-12:
        points = ring[:-1]
        return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))
    return x_sum / (3 * twice_area), y_sum / (3 * twice_area)


def _point_from_geometry(geometry: dict[str, Any]) -> tuple[float, float] | None:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if kind == "Point" and isinstance(coordinates, list) and len(coordinates) >= 2:
        return float(coordinates[0]), float(coordinates[1])
    if kind == "Polygon" and isinstance(coordinates, list) and coordinates:
        return _area_centroid(coordinates[0])
    if kind == "MultiPolygon" and isinstance(coordinates, list) and coordinates:
        rings = [polygon[0] for polygon in coordinates if polygon and polygon[0]]
        centroids = [_area_centroid(ring) for ring in rings]
        valid = [point for point in centroids if point]
        return valid[0] if valid else None
    return None


def _value(properties: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = properties.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _favicon_url(website: str) -> str | None:
    parsed = urlparse(website if "://" in website else f"https://{website}")
    host = (parsed.hostname or "").lower().removeprefix("www.")
    return f"https://icons.duckduckgo.com/ip3/{host}.ico" if "." in host else None


def _address(properties: dict[str, Any]) -> str:
    full = _value(properties, "addr:full", "address", "full_address")
    if full:
        return full
    street = _value(properties, "addr:street", "street")
    number = _value(properties, "addr:housenumber", "housenumber", "house_number")
    locality = _value(properties, "addr:city", "city", "addr:suburb", "suburb") or "St. Louis"
    region = _value(properties, "addr:state", "state", "region") or "MO"
    postal = _value(properties, "addr:postcode", "postcode", "postal_code")
    first = " ".join(value for value in (number, street) if value)
    return ", ".join(value for value in (first, locality, region, postal) if value)


def _precision(properties: dict[str, Any], geometry: dict[str, Any]) -> tuple[str, float]:
    address_known = bool(
        _value(properties, "addr:full", "address", "full_address")
        or (_value(properties, "addr:housenumber", "housenumber", "house_number") and _value(properties, "addr:street", "street"))
    )
    business_poi = properties.get("site_evidence") == "osm_business_poi"
    city_building_match = properties.get("site_evidence") == "city_license_building_match"
    has_building = bool(properties.get("building")) and geometry.get("type") in {"Polygon", "MultiPolygon"}
    if city_building_match:
        return "building", 0.96
    if has_building and business_poi:
        return "building", 0.92 if address_known else 0.88
    if business_poi:
        return "site", 0.86 if address_known or properties.get("website") else 0.82
    if address_known:
        return "address", 0.88
    return "approximate", 0.55


def import_geojson(path: Path, source: str) -> tuple[int, int]:
    document = json.loads(path.read_text(encoding="utf-8"))
    features = document.get("features", [])
    candidates: list[dict[str, Any]] = []
    for feature in features:
        properties = feature.get("properties") or {}
        geometry = feature.get("geometry") or {}
        name = _value(properties, "name", "company", "organization", "brand")
        if not name:
            continue
        point = _point_from_geometry(geometry)
        if not point or not _within_launch_radius([point[0], point[1]]):
            continue
        source_id = _value(properties, "source_id", "osm_id", "id") or str(feature.get("id", ""))
        if not source_id:
            continue
        address = _address(properties)
        precision, confidence = _precision(properties, geometry)
        candidates.append({
            "name": name,
            "normalized_name": _normalized_text(name),
            "website": _value(properties, "website", "contact:website", "url") or None,
            "logo_url": _value(properties, "logo_url", "logo") or _favicon_url(_value(properties, "website", "contact:website")) ,
            "address": address or None,
            "city": _value(properties, "addr:city", "city", "addr:suburb", "suburb") or "St. Louis",
            "region": _value(properties, "addr:state", "state", "region") or "MO",
            "postal_code": _value(properties, "addr:postcode", "postcode", "postal_code") or None,
            "coords": [point[0], point[1]],
            "precision": precision,
            "confidence": confidence,
            "source_id": source_id,
            "source": _value(properties, "source") or source,
            "building_source_id": _value(properties, "building_source_id") or None,
        })

    client = _client()
    orgs = [
        {"canonical_name": item["name"], "normalized_name": item["normalized_name"], "source": item["source"]}
        for item in candidates
    ]
    by_name = {org["normalized_name"]: org for org in orgs}
    organizations = list(by_name.values())
    existing_orgs: dict[str, dict[str, Any]] = {}
    names = [org["normalized_name"] for org in organizations]
    for start in range(0, len(names), UPLOAD_BATCH_SIZE):
        rows = (
            client.table("organizations")
            .select("id,normalized_name,website,logo_url")
            .in_("normalized_name", names[start : start + UPLOAD_BATCH_SIZE])
            .execute()
            .data
        ) or []
        existing_orgs.update({row["normalized_name"]: row for row in rows})
    new_organizations = [org for org in organizations if org["normalized_name"] not in existing_orgs]
    for start in range(0, len(new_organizations), UPLOAD_BATCH_SIZE):
        client.table("organizations").upsert(
            new_organizations[start : start + UPLOAD_BATCH_SIZE], on_conflict="normalized_name"
        ).execute()

    org_ids: dict[str, str] = {}
    for start in range(0, len(names), UPLOAD_BATCH_SIZE):
        rows = (
            client.table("organizations")
            .select("id,normalized_name")
            .in_("normalized_name", names[start : start + UPLOAD_BATCH_SIZE])
            .execute()
            .data
        ) or []
        org_ids.update({row["normalized_name"]: str(row["id"]) for row in rows})

    # Keep the employer registry's best-known website and logo. Missing fields
    # from a source never erase richer values already stored for that company.
    metadata_by_name: dict[str, dict[str, str]] = {}
    for item in candidates:
        normalized = str(item["normalized_name"])
        metadata: dict[str, str] = {}
        if item["website"]:
            metadata["website"] = str(item["website"])
            metadata["logo_url"] = str(item["logo_url"] or "")
        if metadata:
            metadata_by_name.setdefault(normalized, metadata)
    for normalized, metadata in metadata_by_name.items():
        existing = existing_orgs.get(normalized, {})
        updates: dict[str, str] = {}
        if not existing.get("website") and metadata.get("website"):
            updates["website"] = metadata["website"]
        if not existing.get("logo_url") and metadata.get("logo_url"):
            updates["logo_url"] = metadata["logo_url"]
        organization_id = org_ids.get(normalized)
        if updates and organization_id:
            client.table("organizations").update(updates).eq("id", organization_id).execute()

    site_rows = []
    for item in candidates:
        organization_id = org_ids.get(item["normalized_name"])
        if not organization_id:
            continue
        site_rows.append({
            "organization_id": organization_id,
            "name": item["name"],
            "address": item["address"],
            "city": item["city"],
            "region": item["region"],
            "postal_code": item["postal_code"],
            "location": _postgis_point(item["coords"]),
            "location_precision": item["precision"],
            "confidence": item["confidence"],
            "source": item["source"],
            "source_id": item["source_id"],
            "building_source_id": item["building_source_id"],
        })
    uploaded = 0
    for start in range(0, len(site_rows), UPLOAD_BATCH_SIZE):
        batch = site_rows[start : start + UPLOAD_BATCH_SIZE]
        client.table("organization_sites").upsert(batch, on_conflict="source,source_id").execute()
        uploaded += len(batch)
    return len(organizations), uploaded


def main() -> int:
    parser = argparse.ArgumentParser(description="Import St. Louis employer sites from a local GeoJSON extract.")
    parser.add_argument("geojson", type=Path)
    parser.add_argument("--source", default="osm", help="Dataset provenance label")
    args = parser.parse_args()
    if not args.geojson.is_file():
        parser.error(f"GeoJSON file does not exist: {args.geojson}")
    try:
        org_count, site_count = import_geojson(args.geojson, args.source)
    except Exception as error:
        print(f"Company-site import failed: {error}", file=sys.stderr)
        return 1
    print(f"Imported/updated {org_count} organizations and {site_count} St. Louis sites.")
    print(f"Launch boundary: {LAUNCH_RADIUS_METERS / 1609.344:.0f} miles from {LAUNCH_CENTER}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
