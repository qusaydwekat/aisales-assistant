ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_tracked BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'unknown';

CREATE TABLE public.meta_product_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.platform_connections(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  last_synced_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  last_error TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, source_type, external_id)
);
GRANT SELECT ON public.meta_product_sources TO authenticated;
GRANT ALL ON public.meta_product_sources TO service_role;
ALTER TABLE public.meta_product_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners and admins can view Meta product sources"
  ON public.meta_product_sources FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = meta_product_sources.store_id
        AND stores.user_id = (select auth.uid())
    ) OR public.has_role((select auth.uid()), 'admin')
  );

CREATE TABLE public.product_source_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.meta_product_sources(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  external_group_id TEXT,
  source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  missing_sync_count INTEGER NOT NULL DEFAULT 0,
  conflict_fields TEXT[] NOT NULL DEFAULT '{}',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id),
  UNIQUE (store_id, external_key)
);
GRANT SELECT ON public.product_source_links TO authenticated;
GRANT ALL ON public.product_source_links TO service_role;
ALTER TABLE public.product_source_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners and admins can view product source links"
  ON public.product_source_links FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = product_source_links.store_id
        AND stores.user_id = (select auth.uid())
    ) OR public.has_role((select auth.uid()), 'admin')
  );

CREATE TABLE public.product_import_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.meta_product_sources(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  external_key TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  issues TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  permalink TEXT,
  photos TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id),
  UNIQUE (store_id, external_key)
);
GRANT SELECT ON public.product_import_candidates TO authenticated;
GRANT ALL ON public.product_import_candidates TO service_role;
ALTER TABLE public.product_import_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners and admins can view product import candidates"
  ON public.product_import_candidates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = product_import_candidates.store_id
        AND stores.user_id = (select auth.uid())
    ) OR public.has_role((select auth.uid()), 'admin')
  );

CREATE TABLE public.product_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.meta_product_sources(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_sync_runs TO authenticated;
GRANT ALL ON public.product_sync_runs TO service_role;
ALTER TABLE public.product_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store owners and admins can view product sync runs"
  ON public.product_sync_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = product_sync_runs.store_id
        AND stores.user_id = (select auth.uid())
    ) OR public.has_role((select auth.uid()), 'admin')
  );

CREATE INDEX idx_meta_product_sources_auto_sync
  ON public.meta_product_sources (auto_sync, status);
CREATE INDEX idx_product_source_links_product
  ON public.product_source_links (product_id);
CREATE INDEX idx_product_import_candidates_review
  ON public.product_import_candidates (store_id, status, created_at DESC);
CREATE INDEX idx_product_sync_runs_source
  ON public.product_sync_runs (source_id, created_at DESC);

CREATE TRIGGER update_meta_product_sources_updated_at
  BEFORE UPDATE ON public.meta_product_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_product_source_links_updated_at
  BEFORE UPDATE ON public.product_source_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_product_import_candidates_updated_at
  BEFORE UPDATE ON public.product_import_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();