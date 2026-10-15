-- Vector search index
CREATE INDEX IF NOT EXISTS idx_products_image_embedding_hnsw
  ON public.products USING hnsw (image_embedding vector_cosine_ops);

-- Internal functions: only triggers / backend may run them
REVOKE EXECUTE ON FUNCTION public.reduce_stock_on_confirm() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_profile_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.match_products_by_image(uuid, vector, integer) FROM PUBLIC, anon;

-- Token health tracking
ALTER TABLE public.platform_connections
  ADD COLUMN IF NOT EXISTS token_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS token_error text;

-- Dead-letter log for failed webhook processing
CREATE TABLE public.webhook_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  page_id text,
  sender_id text,
  error text,
  payload jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.webhook_failures TO authenticated;
GRANT ALL ON public.webhook_failures TO service_role;
ALTER TABLE public.webhook_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook failures" ON public.webhook_failures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins resolve webhook failures" ON public.webhook_failures
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_webhook_failures_created ON public.webhook_failures (created_at DESC);

-- Daily token health check
SELECT cron.schedule('meta-token-health', '0 6 * * *', $$
  SELECT net.http_post(
    url:='https://xcmlrxrwwqkiychpommv.supabase.co/functions/v1/token-health',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjbWxyeHJ3d3FraXljaHBvbW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MjkyMzksImV4cCI6MjA5MDAwNTIzOX0.ie8Jzni3bTM6cdueuScD-aWqJQGff6uGpDvLPZ3uiAs"}'::jsonb,
    body:='{}'::jsonb);
$$);