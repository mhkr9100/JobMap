
import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

# Very simple samples to test basic connectivity
sample_jobs = [
    {"title": "AI Architect", "company": "Google", "location_label": "St. Louis", "coords": [-90.199, 38.627], "salary": "150k", "workType": "Hybrid", "status": "Available"},
    {"title": "Frontend Dev", "company": "Apple", "location_label": "St. Louis", "coords": [-90.205, 38.630], "salary": "130k", "workType": "Remote", "status": "Available"},
]

print("🌱 Attempting to seed jobs...")
for job in sample_jobs:
    try:
        job_data = {
            "title": job["title"],
            "company": job["company"],
            "location_label": job["location_label"],
            "location": f"POINT({job['coords'][0]} {job['coords'][1]})",
            "coords": job["coords"],
            "salary": job["salary"],
            "workType": job["workType"],
            "status": job["status"]
        }
        supabase.table("jobs").upsert(job_data).execute()
        print(f"✅ Seeded: {job['title']}")
    except Exception as e:
        print(f"❌ Failed to seed {job['title']}: {e}")

print("🏁 Done.")
