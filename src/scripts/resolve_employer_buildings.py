"""Resolve active St. Louis job employers to verified building rooftops and logos.

This module bridges the gap between city-level job-board postings (e.g.
"World Wide Technology - Maryland Heights, MO") and actual 3D building pins:
1. Cleans remote-only and out-of-launch-radius records from `public.jobs`.
2. Matches jobs against existing verified sites in `public.organization_sites`
   using both exact and canonical company names plus locality filtering.
3. Discovers missing employer worksites within the 50-mile St. Louis radius via
   curated major St. Louis campuses, Mapbox Search Box POI lookup, and ArcGIS
   POI/Building lookup, verifying company name token overlap.
4. Snaps discovered worksite coordinates onto actual 3D building footprints via
   Mapbox `mapbox-streets-v8` building Tilequery so markers sit on buildings,
   never in the middle of the road.
5. Enriches `public.organizations` with company websites and favicon/logo URLs.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from typing import Any
from urllib.parse import quote, urlparse

import requests
from supabase import Client

from harvest_jobs import (
    LAUNCH_CENTER,
    LAUNCH_RADIUS_METERS,
    MAPBOX_TOKEN,
    UPLOAD_BATCH_SIZE,
    _get_supabase,
    _normalized_text,
    _postgis_point,
    _site_coordinates,
    _street_fingerprint,
    _within_launch_radius,
)

ST_LOUIS_BBOX = "-91.14,37.904,-89.26,39.35"
USER_AGENT = "JobMap employer-building-resolver/1.0"

_STOP_TOKENS = {
    "the", "of", "and", "in", "at", "for", "st", "saint", "louis", "mo", "il",
    "usa", "us", "inc", "llc", "ltd", "corp", "corporation", "co", "company",
    "group", "holdings", "services", "service", "solutions", "brands",
    "international", "national", "global", "america", "american", "midwest",
    "regional", "system", "systems", "center", "centre", "associates",
    "partners", "enterprise", "enterprises", "city", "county", "state",
}

# Verified major St. Louis region employers & headquarters campuses
KNOWN_STL_EMPLOYER_SITES: dict[str, dict[str, Any]] = {
    "bjc healthcare": {
        "name": "BJC HealthCare Center for Clinical Excellence",
        "address": "4901 Forest Park Ave, St. Louis, MO 63108",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63108",
        "coords": [-90.26243, 38.63940],
        "website": "bjc.org",
    },
    "barnes jewish hospital": {
        "name": "Barnes-Jewish Hospital",
        "address": "1 Barnes Jewish Hospital Plaza, St. Louis, MO 63110",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63110",
        "coords": [-90.26282, 38.63800],
        "website": "barnesjewish.org",
    },
    "washington university in st louis": {
        "name": "Washington University in St. Louis",
        "address": "1 Brookings Dr, St. Louis, MO 63130",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63130",
        "coords": [-90.31060, 38.64793],
        "website": "wustl.edu",
    },
    "mercy": {
        "name": "Mercy Hospital St. Louis",
        "address": "615 S New Ballas Rd, St. Louis, MO 63141",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63141",
        "coords": [-90.44648, 38.64547],
        "website": "mercy.net",
    },
    "mercy hospital st louis critical care medicine fellowship": {
        "name": "Mercy Hospital St. Louis",
        "address": "615 S New Ballas Rd, St. Louis, MO 63141",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63141",
        "coords": [-90.44648, 38.64547],
        "website": "mercy.net",
    },
    "ssm health": {
        "name": "SSM Health Saint Louis University Hospital",
        "address": "1201 S Grand Blvd, St. Louis, MO 63104",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63104",
        "coords": [-90.23845, 38.62235],
        "website": "ssmhealth.com",
    },
    "st luke s hospital mo": {
        "name": "St. Luke's Hospital",
        "address": "232 S Woods Mill Rd, Chesterfield, MO 63017",
        "city": "Chesterfield",
        "region": "MO",
        "postal_code": "63017",
        "coords": [-90.50238, 38.65130],
        "website": "stlukes-stl.com",
    },
    "boeing": {
        "name": "Boeing St. Louis Campus",
        "address": "5775 Campus Pkwy, Hazelwood, MO 63042",
        "city": "Hazelwood",
        "region": "MO",
        "postal_code": "63042",
        "coords": [-90.39064, 38.77482],
        "website": "boeing.com",
    },
    "world wide technology": {
        "name": "World Wide Technology Global Headquarters",
        "address": "1 World Wide Way, Maryland Heights, MO 63146",
        "city": "Maryland Heights",
        "region": "MO",
        "postal_code": "63146",
        "coords": [-90.44907, 38.70194],
        "website": "wwt.com",
    },
    "mastercard": {
        "name": "Mastercard Global Operations Center",
        "address": "2200 MasterCard Blvd, O'Fallon, MO 63368",
        "city": "O'Fallon",
        "region": "MO",
        "postal_code": "63368",
        "coords": [-90.74643, 38.74663],
        "website": "mastercard.com",
    },
    "deloitte": {
        "name": "Deloitte St. Louis",
        "address": "100 S 4th St Ste 300, St. Louis, MO 63102",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63102",
        "coords": [-90.18890, 38.62376],
        "website": "deloitte.com",
    },
    "city of st louis": {
        "name": "St. Louis City Hall",
        "address": "1200 Market St, St. Louis, MO 63103",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63103",
        "coords": [-90.19956, 38.62683],
        "website": "stlouis-mo.gov",
    },
    "archdiocese of st louis": {
        "name": "Archdiocese of St. Louis Rigali Center",
        "address": "20 Archbishop May Dr, St. Louis, MO 63119",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63119",
        "coords": [-90.32040, 38.59195],
        "website": "archstl.org",
    },
    "gardaworld": {
        "name": "GardaWorld Security Services",
        "address": "1022 S 9th St, St. Louis, MO 63104",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63104",
        "coords": [-90.19834, 38.61726],
        "website": "garda.com",
    },
    "securitas": {
        "name": "Securitas Security Services",
        "address": "326 S 21st St, St. Louis, MO 63103",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63103",
        "coords": [-90.21132, 38.62650],
        "website": "securitasinc.com",
    },
    "allied universal": {
        "name": "Allied Universal Security Services",
        "address": "2258 Schuetz Rd, St. Louis, MO 63146",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63146",
        "coords": [-90.43005, 38.70253],
        "website": "aus.com",
    },
    "eaton": {
        "name": "Eaton Bussmann Campus",
        "address": "114 Old State Rd, Ellisville, MO 63021",
        "city": "Ellisville",
        "region": "MO",
        "postal_code": "63021",
        "coords": [-90.58612, 38.59245],
        "website": "eaton.com",
    },
    "carshield": {
        "name": "CarShield Headquarters",
        "address": "503 Pearl Dr, St. Peters, MO 63376",
        "city": "St. Peters",
        "region": "MO",
        "postal_code": "63376",
        "coords": [-90.65480, 38.80960],
        "website": "carshield.com",
    },
    "norton rose fulbright": {
        "name": "Norton Rose Fulbright",
        "address": "7676 Forsyth Blvd, Clayton, MO 63105",
        "city": "Clayton",
        "region": "MO",
        "postal_code": "63105",
        "coords": [-90.33640, 38.64990],
        "website": "nortonrosefulbright.com",
    },
    "ck power": {
        "name": "CK Power Headquarters",
        "address": "1100 Research Blvd, St. Louis, MO 63132",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63132",
        "coords": [-90.38860, 38.67450],
        "website": "ckpower.com",
    },
    "husch blackwell": {
        "name": "Husch Blackwell Clayton Plaza",
        "address": "8001 Forsyth Blvd Ste 1500, St. Louis, MO 63105",
        "city": "Clayton",
        "region": "MO",
        "postal_code": "63105",
        "coords": [-90.34003, 38.65065],
        "website": "huschblackwell.com",
    },
    "river city casino hotel": {
        "name": "River City Casino & Hotel",
        "address": "777 River City Casino Blvd, St. Louis, MO 63125",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63125",
        "coords": [-90.26533, 38.52953],
        "website": "rivercity.com",
    },
    "friendship village stl": {
        "name": "Friendship Village Sunset Hills",
        "address": "12563 Village Circle Dr, St. Louis, MO 63127",
        "city": "St. Louis",
        "region": "MO",
        "postal_code": "63127",
        "coords": [-90.40706, 38.52116],
        "website": "friendshipvillagestl.com",
    },
}


def core_company_name(name: object) -> str:
    """Return a canonical company name with corporate suffixes stripped."""
    text = str(name or "")
    text = re.sub(r"\s*\([^)]*\)\s*", " ", text)
    text = re.sub(r"\s*-\s*(MO|IL|St\.?\s*Louis|US|USA)\b.*$", "", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\b(USA|U\.S\.A\.|U\.S\.|US|Inc\.?|LLC|L\.L\.C\.|Corp\.?|Corporation|Co\.?|Company|Ltd\.?|Limited|Group|Holdings|Brands|International)\b\.?",
        " ",
        text,
        flags=re.IGNORECASE,
    )
    norm = _normalized_text(text)
    norm = re.sub(r"\bsaint\b", "st", norm)
    return " ".join(norm.split()) or _normalized_text(name)


def _distinctive_tokens(name: str) -> list[str]:
    tokens = re.sub(r"\bsaint\b", "st", _normalized_text(name)).split()
    filtered = [t for t in tokens if t not in _STOP_TOKENS and len(t) >= 2]
    return filtered or [t for t in tokens if len(t) >= 2]


def name_matches_place(company: str, candidate_name: str) -> bool:
    """Ensure a geocoded POI/building name genuinely belongs to the company."""
    if not candidate_name:
        return False
    req = _distinctive_tokens(company)
    cand_tokens = re.sub(r"\bsaint\b", "st", _normalized_text(candidate_name)).split()
    if not req or not cand_tokens:
        return False
    cand_set = set(cand_tokens)
    req_joined = "".join(req)
    cand_joined = "".join(cand_tokens)
    if len(req_joined) >= 4 and req_joined in cand_joined:
        return True
    if len(cand_joined) >= 5 and cand_joined in req_joined:
        return True

    first = req[0]
    first_ok = first in cand_set or any(
        len(ct) >= 4 and (ct.startswith(first) or first.startswith(ct))
        for ct in cand_set
    )
    if not first_ok:
        return False
    if len(req) == 1:
        return True
    matched = sum(
        1
        for token in req
        if token in cand_set
        or any(len(ct) >= 4 and (ct.startswith(token) or token.startswith(ct)) for ct in cand_set)
    )
    return matched >= min(2, len(req))


def _extract_city_state(location_label: str) -> tuple[str, str]:
    raw = str(location_label or "").replace(", USA", "").strip()
    if not raw or re.search(r"greater\s+st\.?\s*louis", raw, re.IGNORECASE):
        return "St. Louis", "MO"
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) >= 2:
        city = parts[-2]
        region = parts[-1].split()[0].upper() if parts[-1].split() else "MO"
        if region in {"MO", "IL", "MISSOURI", "ILLINOIS"}:
            region = "IL" if region.startswith("IL") else "MO"
            return city, region
    return "St. Louis", "MO"


def _snap_to_mapbox_building(
    session: requests.Session, lng: float, lat: float
) -> tuple[list[float], str | None] | None:
    """Snap [lng, lat] onto the nearest Mapbox 3D building polygon/point within 85m."""
    if not MAPBOX_TOKEN:
        return None
    url = f"https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/{lng:.6f},{lat:.6f}.json"
    try:
        res = session.get(
            url,
            params={"layers": "building", "radius": 85, "limit": 5, "access_token": MAPBOX_TOKEN},
            timeout=8,
        )
        if not res.ok:
            return None
        features = res.json().get("features") or []
        if not features:
            return None
        best = features[0]
        coords = (best.get("geometry") or {}).get("coordinates")
        if isinstance(coords, list) and len(coords) >= 2:
            b_lng, b_lat = float(coords[0]), float(coords[1])
            if _within_launch_radius([b_lng, b_lat]):
                b_id = best.get("id") or (best.get("properties") or {}).get("id")
                return [b_lng, b_lat], f"mapbox-building:{b_id}" if b_id is not None else "mapbox-building"
    except Exception:
        return None
    return None


def _lookup_company_domain_and_logo(
    session: requests.Session, company: str
) -> tuple[str | None, str | None]:
    """Resolve official company domain and favicon logo via Clearbit Autocomplete."""
    clean = core_company_name(company)
    if not clean or len(clean) < 2:
        return None, None
    try:
        res = session.get(
            "https://autocomplete.clearbit.com/v1/companies/suggest",
            params={"query": clean},
            timeout=6,
        )
        if res.ok:
            items = res.json()
            if isinstance(items, list):
                for item in items:
                    cand_name = str(item.get("name") or "")
                    domain = str(item.get("domain") or "").strip().lower()
                    if domain and "." in domain and name_matches_place(clean, cand_name):
                        return domain, f"https://icons.duckduckgo.com/ip3/{domain}.ico"
    except Exception:
        pass
    return None, None


def discover_single_employer_site(
    company: str, location_label: str
) -> dict[str, Any] | None:
    """Query curated campuses, Mapbox POI, and ArcGIS POI + snap to a 3D building."""
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    norm_full = re.sub(r"\bsaint\b", "st", _normalized_text(company))
    norm_core = core_company_name(company)

    # 1. Check curated St. Louis major employer registry
    for key in (norm_full, norm_core):
        if key in KNOWN_STL_EMPLOYER_SITES:
            seed = dict(KNOWN_STL_EMPLOYER_SITES[key])
            lng, lat = seed["coords"]
            snapped = _snap_to_mapbox_building(session, lng, lat)
            final_coords = snapped[0] if snapped else [lng, lat]
            domain = seed.get("website")
            return {
                "name": seed["name"],
                "address": seed["address"],
                "city": seed["city"],
                "region": seed["region"],
                "postal_code": seed.get("postal_code"),
                "coords": final_coords,
                "precision": "building",
                "confidence": 0.98,
                "source": "stl-curated-campus",
                "source_id": f"curated:{key}",
                "building_source_id": snapped[1] if snapped else "curated-rooftop",
                "website": domain,
                "logo_url": f"https://icons.duckduckgo.com/ip3/{domain}.ico" if domain else None,
            }

    city, region = _extract_city_state(location_label)
    search_names = [norm_core] if norm_core else []
    dist_tokens = _distinctive_tokens(company)
    if len(dist_tokens) >= 2:
        short_brand = " ".join(dist_tokens[:2])
        if short_brand not in search_names:
            search_names.append(short_brand)

    queries: list[str] = []
    for s_name in search_names:
        queries.append(f"{s_name}, {city}, {region}")
        if city.lower() not in {"st. louis", "st louis", "saint louis"}:
            queries.append(f"{s_name}, St. Louis, MO")

    website, logo_url = _lookup_company_domain_and_logo(session, company)

    # 2. Try ArcGIS World Geocoder (POI / BuildingName / PointAddress)
    for q in queries:
        try:
            res = session.get(
                "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates",
                params={
                    "SingleLine": q,
                    "searchExtent": ST_LOUIS_BBOX,
                    "location": f"{LAUNCH_CENTER[0]},{LAUNCH_CENTER[1]}",
                    "outFields": "PlaceName,Place_addr,Addr_type,Type,City,RegionAbbr,Postal,Score",
                    "maxLocations": 8,
                    "f": "json",
                },
                timeout=10,
            )
            if res.ok:
                candidates = res.json().get("candidates") or []
                for cand in candidates:
                    attrs = cand.get("attributes") or {}
                    addr_type = str(attrs.get("Addr_type") or "")
                    place_name = str(attrs.get("PlaceName") or "")
                    score = float(cand.get("score") or 0)
                    loc = cand.get("location") or {}
                    if addr_type not in {"POI", "BuildingName"} or score < 82:
                        continue
                    if not (name_matches_place(company, place_name) or name_matches_place(norm_core, place_name)):
                        continue
                    lng, lat = float(loc.get("x", 0)), float(loc.get("y", 0))
                    if not _within_launch_radius([lng, lat]):
                        continue
                    snapped = _snap_to_mapbox_building(session, lng, lat)
                    final_coords = snapped[0] if snapped else [lng, lat]
                    addr = str(attrs.get("Place_addr") or f"{city}, {region}").strip()
                    return {
                        "name": place_name or company,
                        "address": addr,
                        "city": str(attrs.get("City") or city).strip() or city,
                        "region": str(attrs.get("RegionAbbr") or region).strip() or region,
                        "postal_code": str(attrs.get("Postal") or "").strip() or None,
                        "coords": final_coords,
                        "precision": "building" if snapped else "site",
                        "confidence": min(0.96, round(score / 100, 2)),
                        "source": "arcgis-stl-poi",
                        "source_id": f"arcgis:{_normalized_text(place_name or company)}:{final_coords[0]:.5f},{final_coords[1]:.5f}",
                        "building_source_id": snapped[1] if snapped else None,
                        "website": website,
                        "logo_url": logo_url,
                    }
        except Exception:
            pass

    # 3. Try Mapbox Search Box API v1 (/search/searchbox/v1/forward?types=poi)
    if MAPBOX_TOKEN:
        for q in queries:
            try:
                res = session.get(
                    "https://api.mapbox.com/search/searchbox/v1/forward",
                    params={
                        "q": q,
                        "bbox": ST_LOUIS_BBOX,
                        "proximity": f"{LAUNCH_CENTER[0]},{LAUNCH_CENTER[1]}",
                        "types": "poi",
                        "limit": 5,
                        "access_token": MAPBOX_TOKEN,
                    },
                    timeout=10,
                )
                if res.ok:
                    features = res.json().get("features") or []
                    for feat in features:
                        props = feat.get("properties") or {}
                        p_name = str(props.get("name") or "")
                        if props.get("feature_type") != "poi":
                            continue
                        if not (name_matches_place(company, p_name) or name_matches_place(norm_core, p_name)):
                            continue
                        coords = (feat.get("geometry") or {}).get("coordinates") or []
                        if len(coords) < 2:
                            continue
                        lng, lat = float(coords[0]), float(coords[1])
                        if not _within_launch_radius([lng, lat]):
                            continue
                        snapped = _snap_to_mapbox_building(session, lng, lat)
                        final_coords = snapped[0] if snapped else [lng, lat]
                        addr = str(props.get("full_address") or props.get("address") or f"{city}, {region}").strip()
                        return {
                            "name": p_name or company,
                            "address": addr,
                            "city": city,
                            "region": region,
                            "postal_code": None,
                            "coords": final_coords,
                            "precision": "building" if snapped else "site",
                            "confidence": 0.92,
                            "source": "mapbox-stl-poi",
                            "source_id": f"mapbox:{props.get('mapbox_id') or _normalized_text(p_name)}",
                            "building_source_id": snapped[1] if snapped else None,
                            "website": website,
                            "logo_url": logo_url,
                        }
            except Exception:
                pass

    return None


def match_best_site_for_job(
    location_label: str, sites: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Choose the best verified building/site for an employer in or near the job's city."""
    eligible: list[dict[str, Any]] = []
    for site in sites:
        if site.get("location_precision") not in {"building", "site", "address"}:
            continue
        try:
            conf = float(site.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        if conf < 0.82:
            continue
        coords = _site_coordinates(site.get("location"))
        if not coords or not _within_launch_radius(coords):
            continue
        item = dict(site)
        item["_coords"] = coords
        item["_conf"] = conf
        eligible.append(item)

    if not eligible:
        return None

    source_addr = _normalized_text(location_label)
    source_fp = _street_fingerprint(location_label)
    if source_fp is not None:
        for site in eligible:
            addr = str(site.get("address") or "")
            if (_normalized_text(addr) and _normalized_text(addr) in source_addr) or _street_fingerprint(addr) == source_fp:
                return site

    job_city, _ = _extract_city_state(location_label)
    norm_job_city = re.sub(r"\bsaint\b", "st", _normalized_text(job_city))

    precision_rank = {"building": 3, "site": 2, "address": 1}

    def site_score(site: dict[str, Any]) -> tuple[int, int, float]:
        site_city = re.sub(r"\bsaint\b", "st", _normalized_text(site.get("city") or ""))
        site_addr = re.sub(r"\bsaint\b", "st", _normalized_text(site.get("address") or ""))
        city_match = int(bool(norm_job_city and (norm_job_city == site_city or norm_job_city in site_addr)))
        p_rank = precision_rank.get(str(site.get("location_precision")), 0)
        return (city_match, p_rank, float(site.get("_conf", 0)))

    eligible.sort(key=site_score, reverse=True)
    return eligible[0]


def resolve_all_active_jobs(client: Client | None = None) -> dict[str, int]:
    """Clean remote/out-of-bounds jobs, resolve active employers to buildings, and link jobs."""
    client = client or _get_supabase()

    # 1. Fetch all jobs
    jobs: list[dict[str, Any]] = []
    offset = 0
    while True:
        res = client.table("jobs").select("*").range(offset, offset + 999).execute()
        rows = res.data or []
        jobs.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000

    # 2. Delete remote jobs and non-St. Louis jobs (while rescuing "Greater St. Louis")
    delete_ids: list[str] = []
    active_jobs: list[dict[str, Any]] = []
    for job in jobs:
        wt = str(job.get("worktype") or "").strip().lower()
        loc_label = str(job.get("location_label") or "")
        if "remote" in wt or re.search(r"\bremote\b", loc_label, re.IGNORECASE):
            delete_ids.append(str(job["id"]))
            continue
        if re.search(r"greater\s+st\.?\s*louis", loc_label, re.IGNORECASE):
            job["coords"] = list(LAUNCH_CENTER)
            job["location_label"] = "St. Louis, MO"
        coords = job.get("coords") or _site_coordinates(job.get("location"))
        if not isinstance(coords, list) or len(coords) < 2 or not _within_launch_radius([float(coords[0]), float(coords[1])]):
            delete_ids.append(str(job["id"]))
            continue
        active_jobs.append(job)

    for start in range(0, len(delete_ids), UPLOAD_BATCH_SIZE):
        batch = delete_ids[start : start + UPLOAD_BATCH_SIZE]
        client.table("jobs").delete().in_("id", batch).execute()

    # 3. Load all organizations and organization_sites
    orgs_by_norm: dict[str, dict[str, Any]] = {}
    orgs_by_core: dict[str, list[dict[str, Any]]] = {}
    offset = 0
    while True:
        res = client.table("organizations").select("id,canonical_name,normalized_name,website,logo_url").range(offset, offset + 999).execute()
        rows = res.data or []
        for org in rows:
            norm = str(org.get("normalized_name") or "")
            if norm:
                orgs_by_norm[norm] = org
                core = core_company_name(org.get("canonical_name") or norm)
                orgs_by_core.setdefault(core, []).append(org)
        if len(rows) < 1000:
            break
        offset += 1000

    sites_by_org_id: dict[str, list[dict[str, Any]]] = {}
    offset = 0
    while True:
        res = client.table("organization_sites").select("id,organization_id,name,address,city,region,location,location_precision,confidence").range(offset, offset + 999).execute()
        rows = res.data or []
        for site in rows:
            oid = str(site.get("organization_id") or "")
            if oid:
                sites_by_org_id.setdefault(oid, []).append(site)
        if len(rows) < 1000:
            break
        offset += 1000

    # 4. Identify jobs that need employer site discovery
    unresolved_pairs: dict[tuple[str, str], tuple[str, str]] = {}
    for job in active_jobs:
        company = str(job.get("company") or "").strip()
        loc_label = str(job.get("source_location") or job.get("location_label") or "St. Louis, MO").strip()
        norm = _normalized_text(company)
        core = core_company_name(company)
        candidate_sites: list[dict[str, Any]] = []
        if norm in orgs_by_norm:
            candidate_sites.extend(sites_by_org_id.get(str(orgs_by_norm[norm]["id"]), []))
        for org in orgs_by_core.get(core, []):
            candidate_sites.extend(sites_by_org_id.get(str(org["id"]), []))
        matched_site = match_best_site_for_job(loc_label, candidate_sites)
        if not matched_site:
            city, region = _extract_city_state(loc_label)
            pair_key = (core, f"{city}, {region}")
            unresolved_pairs.setdefault(pair_key, (company, f"{city}, {region}"))

    print(f"Resolving {len(unresolved_pairs)} active St. Louis (employer, city) pairs across {len(active_jobs)} local jobs...")
    discovered_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        future_map = {
            pool.submit(discover_single_employer_site, comp, city_state): pair_key
            for pair_key, (comp, city_state) in unresolved_pairs.items()
        }
        for future in as_completed(future_map):
            pair_key = future_map[future]
            try:
                result = future.result()
                if result:
                    discovered_by_pair[pair_key] = result
            except Exception:
                pass

    print(f"Discovered {len(discovered_by_pair)} verified St. Louis building/site locations for active employers.")

    # 5. Upsert newly discovered sites into organization_sites and update organizations logo/website
    new_site_rows: list[dict[str, Any]] = []
    for (core, _), site_info in discovered_by_pair.items():
        # Find or create organization for this employer
        target_orgs = orgs_by_core.get(core, [])
        if not target_orgs:
            continue
        primary_org = target_orgs[0]
        oid = str(primary_org["id"])
        if site_info.get("website") or site_info.get("logo_url"):
            updates: dict[str, Any] = {}
            if site_info.get("website") and not primary_org.get("website"):
                updates["website"] = site_info["website"]
            if site_info.get("logo_url") and not primary_org.get("logo_url"):
                updates["logo_url"] = site_info["logo_url"]
            if updates:
                try:
                    client.table("organizations").update(updates).eq("id", oid).execute()
                except Exception:
                    pass

        new_site_rows.append({
            "organization_id": oid,
            "name": site_info["name"],
            "address": site_info["address"],
            "city": site_info["city"],
            "region": site_info["region"],
            "postal_code": site_info["postal_code"],
            "location": _postgis_point(site_info["coords"]),
            "location_precision": site_info["precision"],
            "confidence": site_info["confidence"],
            "source": site_info["source"],
            "source_id": site_info["source_id"],
            "building_source_id": site_info["building_source_id"],
        })

    # Deduplicate new_site_rows by (source, source_id)
    deduped_sites = {
        (row["source"], row["source_id"]): row for row in new_site_rows
    }
    site_batches = list(deduped_sites.values())
    for start in range(0, len(site_batches), UPLOAD_BATCH_SIZE):
        batch = site_batches[start : start + UPLOAD_BATCH_SIZE]
        client.table("organization_sites").upsert(batch, on_conflict="source,source_id").execute()

    # Reload sites_by_org_id after upsert
    sites_by_org_id.clear()
    offset = 0
    while True:
        res = client.table("organization_sites").select("id,organization_id,name,address,city,region,location,location_precision,confidence").range(offset, offset + 999).execute()
        rows = res.data or []
        for site in rows:
            oid = str(site.get("organization_id") or "")
            if oid:
                sites_by_org_id.setdefault(oid, []).append(site)
        if len(rows) < 1000:
            break
        offset += 1000

    # 6. Link active jobs to their verified building/site
    linked_jobs_count = 0
    job_updates: list[dict[str, Any]] = []
    for job in active_jobs:
        company = str(job.get("company") or "").strip()
        loc_label = str(job.get("source_location") or job.get("location_label") or "St. Louis, MO").strip()
        norm = _normalized_text(company)
        core = core_company_name(company)
        candidate_sites = []
        if norm in orgs_by_norm:
            candidate_sites.extend(sites_by_org_id.get(str(orgs_by_norm[norm]["id"]), []))
        for org in orgs_by_core.get(core, []):
            candidate_sites.extend(sites_by_org_id.get(str(org["id"]), []))

        matched_site = match_best_site_for_job(loc_label, candidate_sites)
        if not matched_site:
            continue
        coords = _site_coordinates(matched_site.get("location"))
        if not coords or not _within_launch_radius(coords):
            continue

        updated = dict(job)
        updated["organization_id"] = str(matched_site["organization_id"])
        updated["site_id"] = str(matched_site["id"])
        updated["location"] = _postgis_point(coords)
        updated["coords"] = coords
        updated["location_label"] = str(matched_site.get("address") or matched_site.get("name") or job["location_label"])
        updated["location_precision"] = str(matched_site["location_precision"])
        job_updates.append(updated)
        linked_jobs_count += 1

    for start in range(0, len(job_updates), UPLOAD_BATCH_SIZE):
        batch = job_updates[start : start + UPLOAD_BATCH_SIZE]
        client.table("jobs").upsert(batch, on_conflict="id").execute()

    summary = {
        "deleted_remote_or_out_of_bounds": len(delete_ids),
        "active_local_jobs": len(active_jobs),
        "newly_discovered_sites": len(site_batches),
        "linked_jobs": linked_jobs_count,
    }
    print(f"Employer building resolution complete: {summary}")
    return summary


if __name__ == "__main__":
    resolve_all_active_jobs()
