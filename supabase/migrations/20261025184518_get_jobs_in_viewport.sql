-- The location column follows setup_db.py: geography(Point, 4326).
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS dedupe_hash text,
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS application_url text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS job_function text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS job_type text,
  ADD COLUMN IF NOT EXISTS h1b_sponsorship boolean;

GRANT SELECT ON public.jobs TO anon, authenticated;
DROP POLICY IF EXISTS jobs_public_read ON public.jobs;
CREATE POLICY jobs_public_read
  ON public.jobs
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS jobs_geo_idx
  ON public.jobs
  USING GIST (location);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedupe_hash_uidx
  ON public.jobs (dedupe_hash);

DROP FUNCTION IF EXISTS public.get_jobs_in_viewport(
  double precision,
  double precision,
  double precision,
  double precision
);

CREATE OR REPLACE FUNCTION public.get_jobs_in_viewport(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision
)
RETURNS TABLE (
  id text,
  company text,
  title text,
  location_label text,
  coords double precision[],
  status text,
  salary text,
  salary_min numeric,
  salary_max numeric,
  "workType" text,
  industry text,
  job_function text,
  experience_level text,
  job_type text,
  h1b_sponsorship boolean,
  description text,
  application_url text
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  viewport public.geography;
BEGIN
  IF max_lng - min_lng >= 180 THEN
    RETURN QUERY
    SELECT
      jobs.id::text,
      jobs.company::text,
      jobs.title::text,
      jobs.location_label::text,
      ARRAY[public.ST_X(jobs.location::public.geometry), public.ST_Y(jobs.location::public.geometry)]::double precision[],
      jobs.status::text,
      jobs.salary::text,
      jobs.salary_min::numeric,
      jobs.salary_max::numeric,
      jobs.worktype::text,
      jobs.industry::text,
      jobs.job_function::text,
      jobs.experience_level::text,
      jobs.job_type::text,
      jobs.h1b_sponsorship,
      jobs.description::text,
      jobs.application_url::text
    FROM public.jobs AS jobs
    WHERE public.ST_Y(jobs.location::public.geometry) BETWEEN min_lat AND max_lat;

    RETURN;
  END IF;

  viewport := public.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::public.geography;

  RETURN QUERY
  SELECT
    jobs.id::text,
    jobs.company::text,
    jobs.title::text,
    jobs.location_label::text,
    ARRAY[public.ST_X(jobs.location::public.geometry), public.ST_Y(jobs.location::public.geometry)]::double precision[],
    jobs.status::text,
    jobs.salary::text,
    jobs.salary_min::numeric,
    jobs.salary_max::numeric,
    jobs.worktype::text,
    jobs.industry::text,
    jobs.job_function::text,
    jobs.experience_level::text,
    jobs.job_type::text,
    jobs.h1b_sponsorship,
    jobs.description::text,
    jobs.application_url::text
  FROM public.jobs AS jobs
  WHERE jobs.location OPERATOR(public.&&) viewport;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_jobs_in_viewport(
  double precision,
  double precision,
  double precision,
  double precision
) TO anon, authenticated;
