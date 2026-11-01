-- Persistent employer/site registry. Jobs may expire; organization and site
-- records remain available for future harvest matching and map placement.
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  website text,
  logo_url text,
  source text NOT NULL DEFAULT 'manual',
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text,
  address text,
  city text,
  region text,
  postal_code text,
  location geography(Point, 4326) NOT NULL,
  location_precision text NOT NULL DEFAULT 'approximate'
    CHECK (location_precision IN ('building', 'address', 'approximate')),
  confidence real NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  source text NOT NULL,
  source_id text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.organization_sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_precision text NOT NULL DEFAULT 'approximate'
    CHECK (location_precision IN ('building', 'address', 'approximate')),
  ADD COLUMN IF NOT EXISTS source_location text;

CREATE INDEX IF NOT EXISTS organization_sites_location_gix
  ON public.organization_sites USING GIST (location);
CREATE INDEX IF NOT EXISTS organization_sites_org_idx
  ON public.organization_sites (organization_id);
CREATE INDEX IF NOT EXISTS jobs_site_idx ON public.jobs (site_id) WHERE site_id IS NOT NULL;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_public_read ON public.organizations;
CREATE POLICY organizations_public_read ON public.organizations
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS organization_sites_public_read ON public.organization_sites;
CREATE POLICY organization_sites_public_read ON public.organization_sites
  FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.organizations, public.organization_sites TO anon, authenticated;

-- St. Louis launch boundary: an 80,467.2 m radius around downtown. Remote
-- listings and out-of-area listings remain stored but are not displayed.
DROP FUNCTION IF EXISTS public.get_jobs_in_viewport(double precision, double precision, double precision, double precision);
CREATE FUNCTION public.get_jobs_in_viewport(
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
  WHERE j.worktype IS DISTINCT FROM 'Remote'
    AND public.ST_DWithin(COALESCE(s.location, j.location), a.center, 80467.2)
    AND (
      (j.site_id IS NOT NULL AND s.location OPERATOR(public.&&) v.geog)
      OR (j.site_id IS NULL AND j.location OPERATOR(public.&&) v.geog)
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_jobs_in_viewport(
  double precision, double precision, double precision, double precision
) TO anon, authenticated;
