"""Inactive Job Tracker & Pruning Engine for JobMap.

Scans the jobs database to detect and mark inactive or expired listings:
1. Age-based expiration (e.g., posted > 45 days ago)
2. HTTP liveness & dead link detection (404/410 status codes)
3. Job-closed detection in landing page text ('position filled', 'job expired', etc.)

Marked listings are set to status = 'Inactive', ensuring they drop off the 3D map.
"""

import argparse
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
import requests
from supabase import Client, create_client

CLOSED_PATTERNS = re.compile(
    r"(?i)\b("
    r"this position has been filled|"
    r"job is no longer available|"
    r"position is no longer available|"
    r"no longer accepting applications|"
    r"job posting has expired|"
    r"this job has expired|"
    r"requisition has been closed|"
    r"job has been removed|"
    r"opening has been filled"
    r")\b"
)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36 JobMap-Liveness-Checker/1.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _load_local_env() -> None:
    env_file = Path(__file__).resolve().parents[2] / ".env.local"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_local_env()
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SECRET_KEY = (
    os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)


def _get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_SECRET_KEY to prune jobs.")
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)


def check_url_liveness(url: str, timeout: int = 5) -> tuple[bool, str]:
    """Check if an application URL is active or has expired/closed."""
    if not url or not url.startswith("http"):
        return True, "no_url"

    try:
        # First try HEAD request for speed
        res = requests.head(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        if res.status_code in (404, 410):
            return False, f"http_{res.status_code}"

        # If ok, sample GET content if it was redirected
        if res.status_code == 200:
            get_res = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
            # Read first 16KB of text
            chunk = next(get_res.iter_content(chunk_size=16384), b"").decode("utf-8", errors="ignore")
            if CLOSED_PATTERNS.search(chunk):
                return False, "page_closed_text"
            return True, "active"

        return True, f"status_{res.status_code}"
    except (requests.RequestException, Exception) as error:
        # Network timeouts or transient errors should NOT falsely mark jobs inactive
        return True, f"network_error_{type(error).__name__}"


def prune_inactive_jobs(max_days: int = 45, check_links_sample: int = 50, dry_run: bool = False) -> dict[str, int]:
    """Identify inactive jobs and mark them status = 'Inactive'."""
    client = _get_supabase()
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=max_days)

    stats = {
        "scanned": 0,
        "expired_by_date": 0,
        "dead_links": 0,
        "active": 0,
    }

    print(f"=== Starting Inactive Job Pruning (Max Age: {max_days} days) ===")

    # 1. Fetch available jobs
    res = (
        client.table("jobs")
        .select("id, title, company, application_url, created_at, status")
        .neq("status", "Inactive")
        .limit(1000)
        .execute()
    )

    rows = res.data or []
    stats["scanned"] = len(rows)
    print(f"Scanned {len(rows)} non-inactive jobs in database.")

    inactive_ids: list[str] = []

    # 2. Check age-based expiration
    remaining_for_url_check: list[dict] = []
    for job in rows:
        created_str = job.get("created_at")
        if created_str:
            try:
                # Handle ISO timestamps
                clean_time = created_str.replace("Z", "+00:00")
                created_dt = datetime.fromisoformat(clean_time)
                if created_dt < cutoff_date:
                    inactive_ids.append(job["id"])
                    stats["expired_by_date"] += 1
                    continue
            except Exception:
                pass
        remaining_for_url_check.append(job)

    # 3. Sample check links for dead/closed status
    sampled = remaining_for_url_check[:check_links_sample]
    for job in sampled:
        url = job.get("application_url")
        if not url:
            stats["active"] += 1
            continue

        is_alive, reason = check_url_liveness(url)
        if not is_alive:
            print(f"Marking Inactive ({reason}): {job.get('company')} — {job.get('title')}")
            inactive_ids.append(job["id"])
            stats["dead_links"] += 1
        else:
            stats["active"] += 1

    total_to_mark = len(inactive_ids)
    print(f"Identified {total_to_mark} jobs to mark Inactive ({stats['expired_by_date']} expired, {stats['dead_links']} dead links).")

    if dry_run:
        print("[DRY RUN] No database changes written.")
        return stats

    # 4. Update inactive status in database in batches
    if inactive_ids:
        for i in range(0, len(inactive_ids), 100):
            batch = inactive_ids[i : i + 100]
            try:
                client.table("jobs").update({"status": "Inactive"}).in_("id", batch).execute()
            except Exception as update_err:
                print(f"Batch update notice: {update_err}")

    print("Inactive job pruning complete.")
    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prune inactive jobs from JobMap database")
    parser.add_argument("--max-days", type=int, default=45, help="Maximum listing age in days before expiration")
    parser.add_argument("--check-links", type=int, default=50, help="Number of URLs to sample for dead link checks")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making database changes")
    args = parser.parse_args()

    prune_inactive_jobs(max_days=args.max_days, check_links_sample=args.check_links, dry_run=args.dry_run)
