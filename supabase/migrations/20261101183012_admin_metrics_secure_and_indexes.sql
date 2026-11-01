-- Admin metrics are gathered by the authenticated, server-only admin API.
-- Keep this aggregate out of PostgREST because SECURITY DEFINER data access
-- should not be exposed through a public RPC endpoint.
DROP FUNCTION IF EXISTS public.get_admin_metrics();

CREATE INDEX IF NOT EXISTS jobs_organization_id_idx
  ON public.jobs (organization_id) WHERE organization_id IS NOT NULL;
