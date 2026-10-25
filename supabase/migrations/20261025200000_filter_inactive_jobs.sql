-- Migration to exclude Inactive, Expired, and Closed jobs from get_jobs_in_viewport

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
    WHERE public.ST_Y(jobs.location::public.geometry) BETWEEN min_lat AND max_lat
      AND (jobs.status IS NULL OR jobs.status NOT IN ('Inactive', 'Expired', 'Closed', 'Rejected'));

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
  WHERE jobs.location OPERATOR(public.&&) viewport
    AND (jobs.status IS NULL OR jobs.status NOT IN ('Inactive', 'Expired', 'Closed', 'Rejected'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_jobs_in_viewport(
  double precision,
  double precision,
  double precision,
  double precision
) TO anon, authenticated;
