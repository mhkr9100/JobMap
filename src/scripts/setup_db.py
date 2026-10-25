
import os
from supabase import create_client

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")
supabase = create_client(url, key)

# Note: Supabase REST API doesn't allow creating tables directly for security.
# This MUST be done in the SQL Editor of the Dashboard.
print("SQL Command to run in Supabase Dashboard SQL Editor:")
print("""
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location_label TEXT,
  location GEOGRAPHY(POINT) NOT NULL,
  coords FLOAT8[],
  salary TEXT,
  workType TEXT,
  status TEXT DEFAULT 'Available',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_geo_idx ON jobs USING GIST (location);
""")
