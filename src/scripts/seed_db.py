
import os
from supabase import create_client, Client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase: Client = create_client(url, key)

# Sample jobs in St. Louis (SLU and surrounding areas)
sample_jobs = [
    {"title": "AI Architect", "company": "Google", "location_label": "St. Louis, MO", "coords": [-90.199, 38.627], "salary": "150k", "workType": "Hybrid", "status": "Available"},
    {"title": "Frontend Engineer", "company": "Apple", "location_label": "St. Louis, MO", "coords": [-90.205, 38.630], "salary": "130k", "workType": "Remote", "status": "Available"},
    {"title": "Security Specialist", "company": "SLU CGC", "location_label": "St. Louis, MO", "coords": [-90.195, 38.625], "salary": "80k", "workType": "Onsite", "status": "Available"},
    {"title": "Data Scientist", "company": "Amazon", "location_label": "St. Louis, MO", "coords": [-90.210, 38.620], "salary": "140k", "workType": "Hybrid", "status": "Available"},
    {"title": "Janitor", "company": "City Hall", "location_label": "St. Louis, MO", "coords": [-90.185, 38.626], "salary": "40k", "workType": "Onsite", "status": "Available"},
    {"title": "Security Guard", "company": "WashU", "location_label": "St. Louis, MO", "coords": [-90.250, 38.640], "salary": "45k", "workType": "Onsite", "status": "Available"},
]

print("🌱 Seeding database with golden samples...")

for job in sample_jobs:
    # Format for PostGIS
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
    print(f"✅ Seeded: {job['title']} at {job['company']}")

print("🏁 Seeding complete!")
