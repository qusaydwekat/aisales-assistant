-- 1. Per-store batching settings
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS collection_window_seconds integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS silence_followup_enabled boolean NOT NULL DEFAULT false;

-- Clamp window to 3-10 via trigger (avoid CHECK with mutable funcs)
CREATE OR REPLACE FUNCTION public.clamp_ai_collection_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.collection_window_seconds IS NULL OR NEW.collection_window_seconds < 3 THEN
    NEW.collection_window_seconds := 3;
  ELSIF NEW.collection_window_seconds > 10 THEN
    NEW.collection_window_seconds := 10;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clamp_ai_collection_window_trg ON public.ai_settings;
CREATE TRIGGER clamp_ai_collection_window_trg
BEFORE INSERT OR UPDATE ON public.ai_settings
FOR EACH ROW EXECUTE FUNCTION public.clamp_ai_collection_window();

-- 2. Batch log table
CREATE TABLE IF NOT EXISTS public.ai_message_batch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  platform text NOT NULL,
  customer_messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_reply text NOT NULL DEFAULT '',
  image_count integer NOT NULL DEFAULT 0,
  window_seconds integer NOT NULL DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_batch_log_store ON public.ai_message_batch_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_message_batch_log_convo ON public.ai_message_batch_log(conversation_id, created_at DESC);

ALTER TABLE public.ai_message_batch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their batch logs"
ON public.ai_message_batch_log
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.stores
  WHERE stores.id = ai_message_batch_log.store_id
    AND stores.user_id = auth.uid()
));

CREATE POLICY "Admins can view all batch logs"
ON public.ai_message_batch_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));