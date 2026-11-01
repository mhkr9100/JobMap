"""Multi-source harvester for JobMap.

Collects jobs from:
1. JobSpy (Indeed, LinkedIn, Glassdoor, ZipRecruiter) across all sectors
2. Free open APIs (Remotive, Arbeitnow, Jobicy)
3. National rotation across top US metropolitan areas

Features:
- Robust SHA-256 deduplication
- Automatic PostGIS geography coordinates & Mapbox geocoding cache
- Salary bounds normalization ($/year)
- Automatic fallback for legacy database schemas
"""

import hashlib
import math
import os
import re
import struct
import unicodedata
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from urllib.parse import quote
from uuid import UUID

import pandas as pd
import requests
from jobspy import scrape_jobs
from supabase import Client, create_client

# All job sectors requested by user: Software, Hardware, Cleaning, Security, etc.
SEARCH_CATEGORIES: tuple[tuple[str, str], ...] = (
    ("Cleaning", "cleaning janitor custodian housekeeping"),
    ("Security", "security guard officer"),
    ("Maintenance", "maintenance technician facilities"),
    ("Healthcare", "medical assistant phlebotomist"),
    ("Nursing", "registered nurse LPN"),
    ("Education", "teacher instructor tutor"),
    ("Warehouse", "warehouse associate forklift operator"),
    ("Transportation", "delivery driver CDL courier"),
    ("Customer Service", "customer service representative call center"),
    ("Retail", "retail associate cashier store associate"),
    ("Hospitality", "hotel front desk concierge"),
    ("Food Service", "restaurant cook server barista"),
    ("Construction", "construction worker laborer carpenter"),
    ("Skilled Trades", "electrician plumber HVAC mechanic"),
    ("Manufacturing", "manufacturing production assembler"),
    ("Administration", "administrative assistant office manager"),
    ("Accounting", "accountant bookkeeper billing"),
    ("Sales", "sales representative account executive"),
    ("Marketing", "marketing specialist coordinator"),
    ("Software", "software engineer developer"),
    ("Hardware", "hardware engineer electrical technician"),
    ("IT", "IT support technician sysadmin"),
    ("Data", "data analyst data engineer"),
)

LAUNCH_LOCATION = "St. Louis, MO"
LAUNCH_CENTER = (-90.1994, 38.627)
LAUNCH_RADIUS_METERS = 80_467.2  # 50 miles from downtown St. Louis

SITES = ("indeed", "linkedin", "glassdoor")
RESULTS_PER_SITE = 10
UPLOAD_BATCH_SIZE = 100
GEOCODE_CACHE: dict[str, list[float] | None] = {}

_SALARY_NUMBER_PATTERN = re.compile(
    r"(?<![\w.])(?P<amount>\d[\d,]*(?:\.\d+)?|\.\d+)\s*(?P<unit>[kKmM])?(?![A-Za-z])"
)
_POINT_PATTERN = re.compile(r"POINT\(\s*([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*\)", re.IGNORECASE)
_STREET_SUFFIXES = {
    "street", "st", "road", "rd", "avenue", "ave", "boulevard", "blvd",
    "drive", "dr", "lane", "ln", "court", "ct", "highway", "hwy",
    "parkway", "pkwy", "place", "pl", "terrace", "ter", "way",
}


def _load_local_env() -> None:
    """Load .env.local values for local runs."""
    env_file = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_file.is_file():
        return

    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip("\"'")
        os.environ.setdefault(key.strip(), value)


_load_local_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY"
)
MAPBOX_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN") or os.environ.get(
    "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"
)


def normalize_salary(salary: str) -> tuple[int | None, int | None]:
    """Return annual bounds from strings such as '$120k - $150k' or '$60/hour'."""
    amounts: list[int] = []
    for match in _SALARY_NUMBER_PATTERN.finditer(salary):
        try:
            amount = Decimal(match.group("amount").replace(",", ""))
        except InvalidOperation:
            continue

        unit = (match.group("unit") or "").lower()
        if unit == "k":
            amount *= 1_000
        elif unit == "m":
            amount *= 1_000_000
        amounts.append(int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))

    if not amounts:
        return None, None

    normalized_salary = salary.casefold()
    if re.search(r"\b(hour|hourly|hr)\b|/\s*h\b", normalized_salary):
        annual_multiplier = 2_080
    elif re.search(r"\b(week|weekly)\b|/\s*w\b", normalized_salary):
        annual_multiplier = 52
    elif re.search(r"\b(month|monthly)\b|/\s*mo\b", normalized_salary):
        annual_multiplier = 12
    elif re.search(r"\b(day|daily)\b|/\s*d\b", normalized_salary):
        annual_multiplier = 260
    else:
        annual_multiplier = 1
    amounts = [amount * annual_multiplier for amount in amounts]

    return min(amounts), max(amounts)


def _normalized_text(value: object) -> str:
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return ""
    normalized = unicodedata.normalize("NFKD", str(value))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").casefold()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", ascii_text).split())


def generate_job_hash(job_data: Mapping[str, object]) -> str:
    """Return a stable SHA-256 ID from company, title, and normalized location."""
    location = job_data.get("location_label") or job_data.get("location") or ""
    normalized_location = _normalized_text(location)
    normalized_location = re.sub(r"\bsaint\b", "st", normalized_location)
    normalized_location = re.sub(r"\b(united states|usa)\b", "", normalized_location)
    normalized_location = " ".join(normalized_location.split())
    identity = "|".join(_normalized_text(job_data.get(field, "")) for field in ("company", "title"))
    identity += "|" + normalized_location
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def _within_launch_radius(coords: list[float]) -> bool:
    """Keep the launch harvest local, even when job boards return broad metros."""
    lng, lat = coords
    if not (math.isfinite(lng) and math.isfinite(lat) and -180 <= lng <= 180 and -90 <= lat <= 90):
        return False
    center_lng, center_lat = LAUNCH_CENTER
    radians = math.radians
    d_lat = radians(lat - center_lat)
    d_lng = radians(lng - center_lng)
    a = math.sin(d_lat / 2) ** 2 + math.cos(radians(center_lat)) * math.cos(radians(lat)) * math.sin(d_lng / 2) ** 2
    a = min(1.0, max(0.0, a))
    distance = 6_371_008.8 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return distance <= LAUNCH_RADIUS_METERS


def _site_coordinates(value: object) -> list[float] | None:
    if isinstance(value, str):
        match = _POINT_PATTERN.search(value)
        if match:
            return [float(match.group(1)), float(match.group(2))]
        # PostgREST serializes PostGIS geography columns as EWKB hex. Decode
        # standard Point values so exact organization-site matches can be used.
        try:
            raw = bytes.fromhex(value)
        except ValueError:
            raw = b""
        if len(raw) >= 21 and raw[0] in (0, 1):
            byte_order = "<" if raw[0] == 1 else ">"
            geometry_type = struct.unpack_from(f"{byte_order}I", raw, 1)[0]
            has_srid = bool(geometry_type & 0x20000000)
            has_z = bool(geometry_type & 0x80000000)
            has_m = bool(geometry_type & 0x40000000)
            if geometry_type & 0xFFFF == 1:
                offset = 1 + 4
                if has_srid:
                    srid = struct.unpack_from(f"{byte_order}I", raw, offset)[0]
                    if srid != 4326:
                        return None
                    offset += 4
                if len(raw) >= offset + 16:
                    lng, lat = struct.unpack_from(f"{byte_order}dd", raw, offset)
                    if math.isfinite(lng) and math.isfinite(lat):
                        return [lng, lat]
    if isinstance(value, Mapping):
        coordinates = value.get("coordinates")
        if isinstance(coordinates, (list, tuple)) and len(coordinates) >= 2:
            try:
                return [float(coordinates[0]), float(coordinates[1])]
            except (TypeError, ValueError):
                return None
    return None


def _postgis_point(coords: list[float] | tuple[float, float]) -> str:
    """Encode longitude/latitude in the WKT form accepted by PostGIS columns."""
    lng, lat = float(coords[0]), float(coords[1])
    if not (math.isfinite(lng) and math.isfinite(lat) and -180 <= lng <= 180 and -90 <= lat <= 90):
        raise ValueError("Point coordinates must be finite longitude/latitude values.")
    return f"POINT({lng:.12f} {lat:.12f})"


def _street_fingerprint(value: object) -> tuple[str, tuple[str, ...]] | None:
    words = _normalized_text(value).split()
    for index, word in enumerate(words):
        if not word.isdigit():
            continue
        street = [
            token
            for token in words[index + 1 :]
            if token not in _STREET_SUFFIXES and token not in {"north", "south", "east", "west", "n", "s", "e", "w", "unit", "suite", "floor"}
        ][:2]
        return (word, tuple(street)) if street else None
    return None


def _load_sites_for_organizations(
    client: Client, organization_ids: list[str]
) -> dict[str, list[dict[str, object]]]:
    sites_by_organization: dict[str, list[dict[str, object]]] = {}
    for id_offset in range(0, len(organization_ids), 100):
        batch_ids = organization_ids[id_offset : id_offset + 100]
        offset = 0
        while True:
            response = (
                client.table("organization_sites")
                .select("id,organization_id,address,location,location_precision,confidence")
                .in_("organization_id", batch_ids)
                .range(offset, offset + 499)
                .execute()
            )
            rows = response.data or []
            for site in rows:
                organization_id = str(site["organization_id"])
                sites_by_organization.setdefault(organization_id, []).append(site)
            if len(rows) < 500:
                break
            offset += 500
    return sites_by_organization


def _verified_site_match(
    location_label: str, sites: list[dict[str, object]]
) -> dict[str, object] | None:
    source_address = _normalized_text(location_label)
    source_fingerprint = _street_fingerprint(location_label)
    candidates: list[dict[str, object]] = []
    for site in sites:
        if site.get("location_precision") not in {"building", "address", "site"}:
            continue
        try:
            confidence = float(site.get("confidence", 0))
        except (TypeError, ValueError):
            continue
        if confidence < 0.85:
            continue
        address = str(site.get("address") or "")
        normalized_address = _normalized_text(address)
        exact = bool(normalized_address and normalized_address in source_address)
        same_street = _street_fingerprint(address) == source_fingerprint
        # A city-only job listing can use the single known local employer site.
        # If the employer has multiple eligible sites, only an address-level
        # match is specific enough to choose one.
        if exact or (source_fingerprint is not None and same_street):
            candidate = dict(site)
            candidate["match_exact"] = exact
            candidates.append(candidate)

    if not source_fingerprint and len(candidates) == 0:
        eligible = [
            site
            for site in sites
            if site.get("location_precision") in {"building", "address", "site"}
            and float(site.get("confidence", 0)) >= 0.85
            and _site_coordinates(site.get("location"))
            and _within_launch_radius(_site_coordinates(site.get("location")) or [])
        ]
        # Duplicate records for the same physical address count as one site.
        unique_addresses = {_normalized_text(site.get("address")) for site in eligible}
        if len(unique_addresses) == 1 and eligible:
            return eligible[0]

    # Distinct source records at the same address are one physical site.
    unique_candidates: dict[str, dict[str, object]] = {}
    for site in candidates:
        key = _normalized_text(site.get("address"))
        current = unique_candidates.get(key)
        if current is None or float(site.get("confidence", 0)) > float(current.get("confidence", 0)):
            unique_candidates[key] = site
    # If the company has multiple indistinguishable sites, never guess.
    return next(iter(unique_candidates.values())) if len(unique_candidates) == 1 else None


def _hash_as_uuid(job_hash: str) -> str:
    """Convert the SHA-256 identity to a deterministic UUID for Postgres UUID columns."""
    raw = bytearray(bytes.fromhex(job_hash[:32]))
    raw[6] = (raw[6] & 0x0F) | 0x80
    raw[8] = (raw[8] & 0x3F) | 0x80
    return str(UUID(bytes=bytes(raw)))


def _as_text(value: object, default: str = "") -> str:
    if value is None or pd.isna(value):
        return default
    text = str(value).strip()
    return default if text.casefold() in {"nan", "none", "<na>"} else text


def _get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "Supabase credentials are missing. Set SUPABASE_URL and "
            "SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in the local "
            "environment or GitHub Actions secrets. The publishable/anon key "
            "cannot write to the jobs table because row-level security protects it."
        )
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def geocode_address(address: str) -> list[float] | None:
    """Return cached Mapbox [longitude, latitude] coordinates for a location."""
    clean_address = address.strip().replace(", USA", "")
    if not clean_address:
        return None

    cache_key = _normalized_text(clean_address)
    if cache_key in GEOCODE_CACHE:
        return GEOCODE_CACHE[cache_key]

    if MAPBOX_TOKEN:
        url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{quote(clean_address)}.json"
        try:
            response = requests.get(
                url,
                params={"access_token": MAPBOX_TOKEN, "limit": 1, "autocomplete": "false", "country": "us"},
                timeout=10,
            )
            response.raise_for_status()
            features = response.json().get("features", [])
            center = features[0].get("center") if features else None
            if center:
                coords = [float(center[0]), float(center[1])]
                GEOCODE_CACHE[cache_key] = coords
                return coords
        except Exception as error:
            print(f"Mapbox geocoding error for {clean_address}: {error}")

    # Fallback to US Census free geocoder
    try:
        census_url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
        census_res = requests.get(
            census_url,
            params={"address": clean_address, "benchmark": "Public_AR_Current", "format": "json"},
            timeout=8,
        )
        if census_res.ok:
            matches = census_res.json().get("result", {}).get("addressMatches", [])
            if matches:
                pt = matches[0].get("coordinates", {})
                coords = [float(pt.get("x", 0)), float(pt.get("y", 0))]
                GEOCODE_CACHE[cache_key] = coords
                return coords
    except Exception:
        pass

    GEOCODE_CACHE[cache_key] = None
    return None


def _salary_bounds(row: pd.Series, salary_text: str) -> tuple[int | None, int | None]:
    bounds = normalize_salary(salary_text)
    if bounds != (None, None):
        return bounds

    raw_min = row.get("min_amount")
    raw_max = row.get("max_amount")
    interval = _as_text(row.get("interval")).casefold()
    try:
        minimum = Decimal(str(raw_min))
        maximum = Decimal(str(raw_max))
        unit = {
            "hourly": " per hour",
            "weekly": " per week",
            "monthly": " per month",
        }.get(interval, "")
        return normalize_salary(f"{minimum} - {maximum}{unit}")
    except (InvalidOperation, TypeError, ValueError):
        return None, None


def _work_type(row: pd.Series, description: str) -> str:
    text = " ".join((description, _as_text(row.get("location")))).casefold()
    # A hybrid schedule is a local worksite, even when the posting mentions
    # occasional remote days. Remote-only roles are discarded at harvest time.
    if re.search(r"\bhybrid\b", text):
        return "Hybrid"
    remote_flag = _as_text(row.get("is_remote")).casefold()
    if remote_flag in {"true", "yes", "1"}:
        return "Remote"
    if re.search(r"\b(remote|work from home|telecommut(?:e|ing))\b", text):
        return "Remote"
    return "On-site"


def _job_type(value: object) -> str | None:
    text = _normalized_text(value)
    compact = text.replace(" ", "")
    if "fulltime" in compact or "permanent" in compact:
        return "Full-time"
    if "parttime" in compact:
        return "Part-time"
    if "contract" in compact or "temporary" in compact:
        return "Contract"
    if "intern" in compact or "apprentice" in compact:
        return "Internship"
    return None


def _experience_level(value: object) -> str | None:
    text = _normalized_text(value)
    for level in ("Intern", "Entry", "Mid", "Senior", "Lead", "Director"):
        if _normalized_text(level) in text:
            return level
    if "junior" in text:
        return "Entry"
    if "experienced" in text:
        return "Mid"
    return None


def _h1b_sponsorship(description: str) -> bool | None:
    text = description.casefold()
    if any(term in text for term in ("no visa sponsorship", "cannot sponsor", "not sponsor", "without sponsorship")):
        return False
    if any(term in text for term in ("h-1b", "h1b", "visa sponsorship", "sponsor work visa")):
        return True
    return None


def harvest_and_upload(location: str | None = None) -> int:
    """Harvest local, non-remote jobs and retain a separate employer registry."""
    location = location or LAUNCH_LOCATION

    print(f"=== Starting Harvest for Metro: {location} ===")
    client = _get_supabase()
    records_by_hash: dict[str, dict[str, object]] = {}
    category_failures: list[str] = []
    category_results = 0

    # Search all configured categories from local job-board results only. Remote
    # roles are excluded, and geocoded points are clipped to the launch radius.
    for industry, search_term in SEARCH_CATEGORIES:
        print(f"Scraping {industry} in {location}...")
        try:
            frame = scrape_jobs(
                site_name=list(SITES),
                search_term=search_term,
                location=location,
                results_wanted=RESULTS_PER_SITE,
            )
        except Exception as error:
            print(f"Scrape failed for {industry}: {error}")
            category_failures.append(industry)
            continue

        if frame is None or frame.empty:
            continue

        category_results += len(frame)

        for _, row in frame.iterrows():
            company = _as_text(row.get("company"))
            title = _as_text(row.get("title"))
            source_location = _as_text(row.get("location"), location)
            description = _as_text(row.get("description"))
            if not company or not title:
                continue

            work_type = _work_type(row, description)
            if work_type == "Remote":
                continue
            location_label = source_location or location
            coords = geocode_address(location_label)
            if coords is None or not _within_launch_radius(coords):
                continue

            salary_text = _as_text(row.get("salary"))
            salary_min, salary_max = _salary_bounds(row, salary_text)
            job_data = {
                "company": company,
                "title": title,
                "location_label": location_label,
            }
            job_hash = generate_job_hash(job_data)
            records_by_hash[job_hash] = {
                "id": _hash_as_uuid(job_hash),
                "dedupe_hash": job_hash,
                "title": title,
                "company": company,
                "location_label": location_label,
                "source_location": location_label,
                "location": _postgis_point(coords),
                "coords": coords,
                "location_precision": "approximate",
                "salary": salary_text or "Not Listed",
                "salary_min": salary_min,
                "salary_max": salary_max,
                "worktype": work_type,
                "status": "Available",
                "description": description,
                "application_url": _as_text(row.get("job_url")) or None,
                "industry": _as_text(row.get("company_industry")) or industry,
                "job_function": industry,
                "experience_level": _experience_level(row.get("job_level")),
                "job_type": _job_type(row.get("job_type")),
                "h1b_sponsorship": _h1b_sponsorship(description),
            }

    records = list(records_by_hash.values())
    print(f"Total unique candidates to upsert: {len(records)}")
    print(
        f"Scraper summary: {len(SEARCH_CATEGORIES) - len(category_failures)} of "
        f"{len(SEARCH_CATEGORIES)} categories completed; {category_results} "
        f"scraped rows; {len(category_failures)} category errors."
    )

    if not records:
        raise RuntimeError(
            "Harvest produced no geocoded job records. Check source availability, "
            "location/geocoding settings, and the per-category messages above."
        )

    uploaded = 0
    failed_batches = 0
    # The employer registry is long-lived. Job rows can expire independently;
    # company entities survive each harvest and can later be joined to verified
    # building/site records imported from local GIS and OpenStreetMap sources.
    organization_names = sorted({str(row["company"]) for row in records})
    organizations = [
        {
            "canonical_name": name,
            "normalized_name": _normalized_text(name),
            "source": "job_harvest",
        }
        for name in organization_names
        if _normalized_text(name)
    ]
    organization_ids: dict[str, str] = {}
    for start in range(0, len(organizations), UPLOAD_BATCH_SIZE):
        org_batch = organizations[start : start + UPLOAD_BATCH_SIZE]
        client.table("organizations").upsert(org_batch, on_conflict="normalized_name").execute()
        normalized_names = [org["normalized_name"] for org in org_batch]
        org_rows = (
            client.table("organizations")
            .select("id,normalized_name")
            .in_("normalized_name", normalized_names)
            .execute()
            .data
        ) or []
        organization_ids.update({row["normalized_name"]: str(row["id"]) for row in org_rows})

    for job in records:
        normalized_company = _normalized_text(job["company"])
        if organization_id := organization_ids.get(normalized_company):
            job["organization_id"] = organization_id
    sites_by_organization = _load_sites_for_organizations(client, list(organization_ids.values()))
    for job in records:
        organization_id = job.get("organization_id")
        if not isinstance(organization_id, str):
            continue
        site = _verified_site_match(
            str(job.get("source_location") or job.get("location_label") or ""),
            sites_by_organization.get(organization_id, []),
        )
        if not site:
            continue
        coords = _site_coordinates(site.get("location"))
        if not coords or not _within_launch_radius(coords):
            continue
        job["site_id"] = str(site["id"])
        job["location"] = _postgis_point(coords)
        job["coords"] = coords
        job["location_label"] = str(site.get("address") or job["location_label"])
        job["location_precision"] = str(site["location_precision"])

    for start in range(0, len(records), UPLOAD_BATCH_SIZE):
        batch = records[start : start + UPLOAD_BATCH_SIZE]
        try:
            client.table("jobs").upsert(batch, on_conflict="id").execute()
            uploaded += len(batch)
        except Exception:
            try:
                client.table("jobs").upsert(batch, on_conflict="dedupe_hash").execute()
                uploaded += len(batch)
            except Exception as batch_error:
                print(f"Supabase upsert notice for batch: {batch_error}")
                failed_batches += 1

    if failed_batches:
        raise RuntimeError(
            f"Harvest uploaded {uploaded} of {len(records)} candidate jobs; "
            f"{failed_batches} Supabase batch(es) failed."
        )

    if uploaded == 0:
        raise RuntimeError("Harvest finished without any successful Supabase upserts.")

    print(f"Harvest complete: {uploaded} jobs upserted for {location}.")
    return uploaded


if __name__ == "__main__":
    loc = os.environ.get("HARVEST_LOCATION")
    harvest_and_upload(location=loc)
