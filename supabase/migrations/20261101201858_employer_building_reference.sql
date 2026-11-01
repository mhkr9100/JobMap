-- Preserve the public source feature identifier used to snap a company site
-- onto a verified building footprint.
ALTER TABLE public.organization_sites
  ADD COLUMN IF NOT EXISTS building_source_id text;
