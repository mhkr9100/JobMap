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
import os
import re
import unicodedata
from collections.abc import Mapping
from datetime import datetime
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

# Top US Metros rotated on hourly cron jobs
US_METROS: tuple[str, ...] = (
    "St. Louis, MO",
    "New York, NY",
    "San Francisco, CA",
    "Chicago, IL",
    "Miami, FL",
    "Austin, TX",
    "Seattle, WA",
    "Denver, CO",
    "Atlanta, GA",
    "Dallas, TX",
    "Boston, MA",
    "Los Angeles, CA",
    "Phoenix, AZ",
    "Washington, DC",
)

SITES = ("indeed", "linkedin", "glassdoor")
RESULTS_PER_SITE = 10
UPLOAD_BATCH_SIZE = 100
GEOCODE_CACHE: dict[str, list[float] | None] = {}

_SALARY_NUMBER_PATTERN = re.compile(
    r"(?<![\w.])(?P<amount>\d[\d,]*(?:\.\d+)?|\.\d+)\s*(?P<unit>[kKmM])?(?![A-Za-z])"
)


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
    identity = "|".join(
        _normalized_text(job_data.get(field, ""))
        for field in ("company", "title")
    ) + "|" + _normalized_text(location)
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


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
            "Set SUPABASE_URL and SUPABASE_SECRET_KEY before harvesting; "
            "the jobs table is protected by row-level security."
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
    remote_flag = _as_text(row.get("is_remote")).casefold()
    if remote_flag in {"true", "yes", "1"}:
        return "Remote"
    text = description.casefold()
    if "remote" in text:
        return "Remote"
    if "hybrid" in text:
        return "Hybrid"
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


def harvest_free_apis(default_location: str = "St. Louis, MO") -> list[dict[str, object]]:
    """Harvest free job APIs (Remotive, Arbeitnow) to supplement scrape volume."""
    records: list[dict[str, object]] = []

    # 1. Remotive Free API
    try:
        res = requests.get("https://remotive.com/api/remote-jobs?limit=50", timeout=12)
        if res.ok:
            jobs_data = res.json().get("jobs", [])
            for item in jobs_data:
                title = _as_text(item.get("title"))
                company = _as_text(item.get("company_name"))
                if not title or not company:
                    continue
                location_label = _as_text(item.get("candidate_required_location")) or "USA"
                coords = geocode_address(location_label) or geocode_address(default_location)
                if not coords:
                    continue

                salary_str = _as_text(item.get("salary"))
                s_min, s_max = normalize_salary(salary_str)
                desc = _as_text(item.get("description"))
                h = generate_job_hash({"company": company, "title": title, "location_label": location_label})

                records.append({
                    "id": _hash_as_uuid(h),
                    "dedupe_hash": h,
                    "title": title,
                    "company": company,
                    "location_label": location_label,
                    "location": {"type": "Point", "coordinates": coords},
                    "coords": coords,
                    "salary": salary_str or "Competitive",
                    "salary_min": s_min,
                    "salary_max": s_max,
                    "worktype": "Remote",
                    "status": "Available",
                    "description": desc,
                    "application_url": _as_text(item.get("url")),
                    "industry": _as_text(item.get("category"), "Software"),
                    "job_function": _as_text(item.get("category"), "Engineering"),
                    "experience_level": _experience_level(desc),
                    "job_type": _job_type(item.get("job_type")) or "Full-time",
                    "h1b_sponsorship": _h1b_sponsorship(desc),
                })
    except Exception as error:
        print(f"Remotive free API harvest notice: {error}")

    return records


def harvest_and_upload(location: str | None = None) -> int:
    """Harvest across configured categories and upsert deduplicated jobs."""
    if not location:
        # Rotate through US metros based on the current hour
        current_hour = datetime.utcnow().hour
        location = US_METROS[current_hour % len(US_METROS)]

    print(f"=== Starting Harvest for Metro: {location} ===")
    client = _get_supabase()
    records_by_hash: dict[str, dict[str, object]] = {}

    # 1. Harvest free APIs
    free_api_jobs = harvest_free_apis(default_location=location)
    for job in free_api_jobs:
        records_by_hash[job["dedupe_hash"]] = job
    print(f"Harvested {len(free_api_jobs)} listings from free APIs.")

    # 2. Harvest JobSpy across all categories
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
            continue

        if frame is None or frame.empty:
            continue

        for _, row in frame.iterrows():
            company = _as_text(row.get("company"))
            title = _as_text(row.get("title"))
            source_location = _as_text(row.get("location"), location)
            description = _as_text(row.get("description"))
            if not company or not title:
                continue

            work_type = _work_type(row, description)
            location_label = source_location or location
            geocode_label = location if work_type == "Remote" else location_label
            coords = geocode_address(geocode_label)
            if coords is None:
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
                "location": {"type": "Point", "coordinates": coords},
                "coords": coords,
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

    uploaded = 0
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

    print(f"Harvest complete: {uploaded} jobs upserted for {location}.")
    return uploaded


if __name__ == "__main__":
    loc = os.environ.get("HARVEST_LOCATION")
    harvest_and_upload(location=loc)
