"""Refresh the persistent St. Louis employer-site registry from public sources.

Sources:
* City of St. Louis business-license locations (official ArcGIS feature layer).
* Named employer POIs and business-tagged buildings in Missouri/Illinois OSM extracts.

OSM state extracts are downloaded from Geofabrik rather than queried repeatedly
through the shared Overpass service. All candidates are clipped to the 50-mile
launch radius before they are written to Supabase.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import osmium
import requests

from harvest_jobs import LAUNCH_CENTER, LAUNCH_RADIUS_METERS, _within_launch_radius
from import_company_sites import import_geojson
from resolve_employer_buildings import resolve_all_active_jobs

CITY_LICENSE_LAYER = (
    "https://maps8.stlouis-mo.gov/arcgis/rest/services/SLDC/"
    "Business_Licenses_as_of_October_2025/FeatureServer/0/query"
)
CITY_BUILDING_LAYER = (
    "https://maps8.stlouis-mo.gov/arcgis/rest/services/ASSESSOR/"
    "Assessor_Public_Parcels/MapServer/9/query"
)
GEOFABRIK = "https://download.geofabrik.de/north-america/us/{state}-latest.osm.pbf"
USER_AGENT = "JobMap employer-site refresh/1.0"
PAGE_SIZE = 2000
BUSINESS_TAGS = ("office", "shop", "craft", "healthcare", "industrial", "company")
AMENITY_VALUES = {
    "bank", "clinic", "college", "community_centre", "dentist", "doctors",
    "fast_food", "fuel", "hospital", "library", "pharmacy", "restaurant",
    "school", "social_centre", "social_facility", "university", "veterinary",
}


def _normal_name(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").casefold())


def _distance_meters(lng: float, lat: float) -> float:
    center_lng, center_lat = LAUNCH_CENTER
    radians = math.pi / 180
    d_lat = (lat - center_lat) * radians
    d_lng = (lng - center_lng) * radians
    a = math.sin(d_lat / 2) ** 2 + math.cos(center_lat * radians) * math.cos(lat * radians) * math.sin(d_lng / 2) ** 2
    return 6_371_008.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _ring_centroid(points: list[list[float]]) -> tuple[float, float] | None:
    if len(points) < 4:
        return None
    area2 = x_sum = y_sum = 0.0
    for first, second in zip(points, points[1:]):
        cross = first[0] * second[1] - second[0] * first[1]
        area2 += cross
        x_sum += (first[0] + second[0]) * cross
        y_sum += (first[1] + second[1]) * cross
    if abs(area2) < 1e-12:
        vertices = points[:-1]
        return sum(p[0] for p in vertices) / len(vertices), sum(p[1] for p in vertices) / len(vertices)
    return x_sum / (3 * area2), y_sum / (3 * area2)


def _business_tags(tags: Any) -> bool:
    if not (tags.get("name") or tags.get("brand") or tags.get("operator")):
        return False
    if any(tags.get(key) for key in BUSINESS_TAGS):
        return True
    if tags.get("amenity", "").casefold() in AMENITY_VALUES:
        return True
    return tags.get("leisure", "").casefold() in {"fitness_centre", "sports_centre"}


def _address(tags: Any) -> str | None:
    number = tags.get("addr:housenumber")
    street = tags.get("addr:street")
    if not (number and street):
        return tags.get("addr:full") or tags.get("address") or None
    locality = tags.get("addr:city") or ""
    region = tags.get("addr:state") or ""
    postal = tags.get("addr:postcode") or ""
    return ", ".join(part for part in (f"{number} {street}", locality, region, postal) if part)


def _as_feature(
    *,
    name: str,
    source_id: str,
    geometry: dict[str, Any],
    properties: dict[str, Any],
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": source_id,
        "geometry": geometry,
        "properties": {"name": name, **properties, "source_id": source_id},
    }


def fetch_city_licenses() -> list[dict[str, Any]]:
    """Load City business licenses with high-confidence geocoded addresses."""
    features: list[dict[str, Any]] = []
    params: dict[str, Any] = {
        "where": "1=1",
        "outFields": "OBJECTID,USER_Trade_Name,USER_Street_Address,USER_Tax_Year,USER_Status_Cd_,Score",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": 0,
        "f": "json",
    }
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    while True:
        response = session.get(CITY_LICENSE_LAYER, params=params, timeout=45)
        response.raise_for_status()
        payload = response.json()
        if payload.get("error"):
            raise RuntimeError(f"St. Louis business-license service error: {payload['error']}")
        rows = payload.get("features", [])
        for row in rows:
            attributes = row.get("attributes") or {}
            geometry = row.get("geometry") or {}
            name = str(attributes.get("USER_Trade_Name") or "").strip()
            try:
                lng, lat = float(geometry["x"]), float(geometry["y"])
                score = float(attributes.get("Score") or 0)
            except (KeyError, TypeError, ValueError):
                continue
            if not name or score < 85 or not _within_launch_radius([lng, lat]):
                continue
            address = str(attributes.get("USER_Street_Address") or "").strip()
            features.append(
                _as_feature(
                    name=name,
                    source_id=f"stl-city-license:{attributes.get('OBJECTID')}",
                    geometry={"type": "Point", "coordinates": [lng, lat]},
                    properties={
                        "address": address or None,
                        "city": "St. Louis",
                        "region": "MO",
                        "postal_code": None,
                        "confidence": min(score / 100, 1),
                        "source_id": str(attributes.get("OBJECTID")),
                        "source": "stl-city-business-license-2025",
                    },
                )
            )
        if len(rows) < PAGE_SIZE:
            break
        params["resultOffset"] += PAGE_SIZE
    return features


def snap_city_sites_to_buildings(features: list[dict[str, Any]]) -> int:
    """Snap City address matches onto an assessor footprint only with close evidence."""
    from shapely.geometry import Point, box, shape
    from shapely.ops import nearest_points
    from shapely.strtree import STRtree

    building_features: list[dict[str, Any]] = []
    params: dict[str, Any] = {
        "where": "BLDGHEIGHT > 0",
        "outFields": "OBJECTID,BuildingId,BLDGHEIGHT",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultRecordCount": PAGE_SIZE,
        "resultOffset": 0,
        "f": "geojson",
    }
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    while True:
        response = session.get(CITY_BUILDING_LAYER, params=params, timeout=60)
        response.raise_for_status()
        payload = response.json()
        rows = payload.get("features", [])
        building_features.extend(rows)
        if len(rows) < PAGE_SIZE:
            break
        params["resultOffset"] += PAGE_SIZE

    polygons: list[Any] = []
    source_ids: list[str] = []
    for row in building_features:
        geometry = row.get("geometry")
        if not geometry:
            continue
        try:
            polygon = shape(geometry)
        except Exception:
            continue
        if polygon.is_empty:
            continue
        polygons.append(polygon)
        attributes = row.get("properties") or {}
        building_id = attributes.get("BuildingId") or attributes.get("OBJECTID") or row.get("id")
        source_ids.append(f"stl-assessor-building:{building_id}")
    if not polygons:
        raise RuntimeError("The City assessor building-footprint service returned no usable polygons.")
    tree = STRtree(polygons)

    def meters_between(first: tuple[float, float], second: tuple[float, float]) -> float:
        mean_lat = math.radians((first[1] + second[1]) / 2)
        dx = (first[0] - second[0]) * 111_320 * math.cos(mean_lat)
        dy = (first[1] - second[1]) * 111_320
        return math.hypot(dx, dy)

    snapped = 0
    for feature in features:
        properties = feature["properties"]
        if properties.get("source") != "stl-city-business-license-2025":
            continue
        coordinates = feature["geometry"].get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue
        lng, lat = float(coordinates[0]), float(coordinates[1])
        point = Point(lng, lat)
        radius_x = 8 / (111_320 * max(0.65, math.cos(math.radians(lat))))
        radius_y = 8 / 111_320
        candidates = [int(index) for index in tree.query(box(lng - radius_x, lat - radius_y, lng + radius_x, lat + radius_y))]
        scored: list[tuple[float, int]] = []
        for index in candidates:
            polygon = polygons[index]
            if polygon.covers(point):
                distance = 0.0
            else:
                nearest = nearest_points(point, polygon)[1]
                distance = meters_between((lng, lat), (nearest.x, nearest.y))
            if distance <= 8:
                scored.append((distance, index))
        scored.sort()
        if not scored:
            continue
        if len(scored) > 1 and scored[0][0] > 0.5 and scored[1][0] - scored[0][0] < 3:
            continue
        _, index = scored[0]
        rooftop = polygons[index].representative_point()
        feature["geometry"] = {"type": "Point", "coordinates": [rooftop.x, rooftop.y]}
        properties["site_evidence"] = "city_license_building_match"
        properties["building_source_id"] = source_ids[index]
        snapped += 1
    return snapped


class EmployerPOICollector(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.features: list[dict[str, Any]] = []
        self.seen: set[tuple[str, int, int]] = set()

    def _add(self, kind: str, osm_id: int, tags: Any, geometry: dict[str, Any], point: tuple[float, float]) -> None:
        name = str(tags.get("name") or tags.get("brand") or tags.get("operator") or "").strip()
        if not name or _distance_meters(*point) > LAUNCH_RADIUS_METERS:
            return
        key = (_normal_name(name), round(point[0] * 10_000), round(point[1] * 10_000))
        if key in self.seen:
            return
        self.seen.add(key)
        website = tags.get("contact:website") or tags.get("website") or tags.get("url")
        properties: dict[str, Any] = {
            "source": "openstreetmap",
            "site_evidence": "osm_business_poi",
            "address": _address(tags),
            "city": tags.get("addr:city") or "",
            "region": tags.get("addr:state") or "",
            "postal_code": tags.get("addr:postcode") or None,
            "website": website,
            "logo_url": _favicon_url(website),
            "business_type": next((tags.get(tag) for tag in BUSINESS_TAGS if tags.get(tag)), tags.get("amenity") or tags.get("leisure") or ""),
            "building": tags.get("building") or "",
            "confidence": 0.92 if _address(tags) else 0.84,
        }
        self.features.append(
            _as_feature(
                name=name,
                source_id=f"osm:{kind}/{osm_id}",
                geometry=geometry,
                properties=properties,
            )
        )

    def node(self, node: Any) -> None:
        if not node.location.valid() or not _business_tags(node.tags):
            return
        point = (node.location.lon, node.location.lat)
        self._add("node", node.id, node.tags, {"type": "Point", "coordinates": list(point)}, point)

    def way(self, way: Any) -> None:
        if not _business_tags(way.tags):
            return
        ring: list[list[float]] = []
        for node in way.nodes:
            if not node.location.valid():
                return
            ring.append([node.location.lon, node.location.lat])
        if len(ring) < 3:
            return
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        point = _ring_centroid(ring)
        if point is None:
            return
        self._add("way", way.id, way.tags, {"type": "Polygon", "coordinates": [ring]}, point)


def _favicon_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value if "://" in value else f"https://{value}")
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if not host or "." not in host:
        return None
    return f"https://icons.duckduckgo.com/ip3/{host}.ico"


def _download_pbf(state: str, directory: Path) -> Path:
    destination = directory / f"{state}-latest.osm.pbf"
    if destination.exists() and destination.stat().st_size > 1_000_000:
        return destination
    response = requests.get(GEOFABRIK.format(state=state), headers={"User-Agent": USER_AGENT}, stream=True, timeout=(30, 120))
    response.raise_for_status()
    with destination.open("wb") as output:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            if chunk:
                output.write(chunk)
    if destination.stat().st_size < 1_000_000:
        raise RuntimeError(f"Downloaded {state} OSM extract is unexpectedly small.")
    return destination


def discover_sites(
    pbf_paths: Iterable[Path], include_city_licenses: bool, export_geojson: Path | None = None
) -> tuple[int, int, int]:
    features = fetch_city_licenses() if include_city_licenses else []
    city_count = len(features)
    snapped_count = snap_city_sites_to_buildings(features) if city_count else 0
    collector = EmployerPOICollector()
    for pbf_path in pbf_paths:
        print(f"Scanning OSM employer sites in {pbf_path.name}...", flush=True)
        collector.apply_file(str(pbf_path), locations=True, idx="flex_mem")
    # A City license is a precise business address. Prefer the licensed record
    # where an OSM POI describes the same name and point.
    features.extend(collector.features)
    if export_geojson:
        export_geojson.parent.mkdir(parents=True, exist_ok=True)
        export_geojson.write_text(
            json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8"
        )
        return city_count, len(features), snapped_count
    with tempfile.TemporaryDirectory(prefix="jobmap-sites-") as temporary:
        document = Path(temporary) / "st-louis-sites.geojson"
        document.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
        organizations, sites = import_geojson(document, source="stl-city-license-2025+osm")
    resolve_all_active_jobs()
    return city_count, sites, snapped_count


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh St. Louis employer locations from public business and map datasets.")
    parser.add_argument("--missouri-pbf", type=Path)
    parser.add_argument("--illinois-pbf", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path(".cache/jobmap-sites"))
    parser.add_argument("--skip-city-licenses", action="store_true")
    parser.add_argument("--skip-osm", action="store_true", help="Import the City business-license feed without regional OSM files.")
    parser.add_argument("--export-geojson", type=Path, help="Write discovered records locally instead of importing them.")
    args = parser.parse_args()
    try:
        pbf_paths: list[Path] = []
        if args.missouri_pbf:
            pbf_paths.append(args.missouri_pbf)
        if args.illinois_pbf:
            pbf_paths.append(args.illinois_pbf)
        if not args.skip_osm and not pbf_paths:
            args.data_dir.mkdir(parents=True, exist_ok=True)
            pbf_paths = [_download_pbf(state, args.data_dir) for state in ("missouri", "illinois")]
        city_count, site_count, snapped_count = discover_sites(
            pbf_paths,
            include_city_licenses=not args.skip_city_licenses,
            export_geojson=args.export_geojson,
        )
    except Exception as error:
        print(f"Employer-site discovery failed: {error}", file=sys.stderr)
        return 1
    action = "exported" if args.export_geojson else "upserted"
    print(f"Loaded {city_count:,} high-confidence 2025 City business-license records; {snapped_count:,} matched a City building footprint and {action} {site_count:,} employer-site records.")
    print(f"Radius: {LAUNCH_RADIUS_METERS / 1609.344:.0f} miles from downtown St. Louis. OSM source data is ODbL.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
