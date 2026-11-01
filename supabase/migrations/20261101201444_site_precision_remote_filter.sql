-- A directly mapped employer POI is a verified worksite even when its source
-- does not publish a street address. Keep that evidence tier distinct.
ALTER TABLE public.organization_sites
  DROP CONSTRAINT IF EXISTS organization_sites_location_precision_check;
ALTER TABLE public.organization_sites
  ADD CONSTRAINT organization_sites_location_precision_check
  CHECK (location_precision IN ('building', 'address', 'site', 'approximate'));

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_location_precision_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_location_precision_check
  CHECK (location_precision IN ('building', 'address', 'site', 'approximate'));

-- The old check used a case-sensitive equality and allowed stale remote rows
-- through the public viewport RPC. Keep stored records for audit/history, but
-- do not return remote-only listings or remote-address rows to the map.
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
  application_url text,
  location_precision text,
  organization_id uuid,
  site_id uuid,
  logo_url text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  WITH viewport AS (
    SELECT public.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::public.geography AS geog
  ), launch_area AS (
    SELECT public.ST_SetSRID(public.ST_MakePoint(-90.1994, 38.627), 4326)::public.geography AS center
  )
  SELECT
    j.id::text,
    j.company::text,
    j.title::text,
    COALESCE(NULLIF(s.address, ''), NULLIF(s.name, ''), j.location_label)::text,
    ARRAY[
      public.ST_X(COALESCE(s.location::public.geometry, j.location::public.geometry)),
      public.ST_Y(COALESCE(s.location::public.geometry, j.location::public.geometry))
    ]::double precision[],
    j.status::text,
    j.salary::text,
    j.salary_min::numeric,
    j.salary_max::numeric,
    j.worktype::text,
    j.industry::text,
    j.job_function::text,
    j.experience_level::text,
    j.job_type::text,
    j.h1b_sponsorship,
    j.description::text,
    j.application_url::text,
    CASE WHEN s.id IS NOT NULL THEN s.location_precision ELSE j.location_precision END,
    COALESCE(j.organization_id, s.organization_id),
    j.site_id,
    o.logo_url::text
  FROM public.jobs AS j
  LEFT JOIN public.organization_sites AS s ON s.id = j.site_id
  LEFT JOIN public.organizations AS o ON o.id = COALESCE(j.organization_id, s.organization_id)
  CROSS JOIN viewport AS v
  CROSS JOIN launch_area AS a
  WHERE lower(btrim(COALESCE(j.worktype, ''))) !~ '(^|[^a-z])remote([^a-z]|$)'
    AND lower(COALESCE(j.location_label, '')) !~ '(^|[^a-z])remote([^a-z]|$)'
    AND public.ST_DWithin(COALESCE(s.location, j.location), a.center, 80467.2)
    AND (
      (j.site_id IS NOT NULL AND s.location OPERATOR(public.&&) v.geog)
      OR (j.site_id IS NULL AND j.location OPERATOR(public.&&) v.geog)
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_jobs_in_viewport(
  double precision, double precision, double precision, double precision
) TO anon, authenticated;
