
-- ai_settings: new per-store toggles
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS burst_guard_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS burst_guard_max_messages integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS meta_retry_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicate_order_guard_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duplicate_order_window_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS auto_language_detect_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS out_of_hours_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS out_of_hours_message_en text DEFAULT 'We''re currently closed but I can still take your order and confirm it first thing tomorrow.',
  ADD COLUMN IF NOT EXISTS out_of_hours_message_ar text DEFAULT 'متجرنا مغلق حالياً، لكن يمكنني تسجيل طلبك وسنؤكده فور فتح المتجر صباحاً.';

-- conversations: delivery state
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS delivery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error text;

-- orders: out-of-hours flag for owner review
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS out_of_hours boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_confirmation boolean NOT NULL DEFAULT false;

-- batch log: per-message language + spam flag
ALTER TABLE public.ai_message_batch_log
  ADD COLUMN IF NOT EXISTS detected_language text,
  ADD COLUMN IF NOT EXISTS flagged_high_volume boolean NOT NULL DEFAULT false;

-- Failed Meta deliveries log
CREATE TABLE IF NOT EXISTS public.meta_send_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  conversation_id uuid,
  platform text NOT NULL,
  recipient_id text,
  attempt_count integer NOT NULL DEFAULT 1,
  last_error text,
  payload_preview text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_send_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all send failures" ON public.meta_send_failures;
CREATE POLICY "Admins can view all send failures"
  ON public.meta_send_failures
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Store owners can view their send failures" ON public.meta_send_failures;
CREATE POLICY "Store owners can view their send failures"
  ON public.meta_send_failures
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = meta_send_failures.store_id
      AND stores.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Store owners can update their send failures" ON public.meta_send_failures;
CREATE POLICY "Store owners can update their send failures"
  ON public.meta_send_failures
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.stores
    WHERE stores.id = meta_send_failures.store_id
      AND stores.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_meta_send_failures_store ON public.meta_send_failures(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_recent ON public.orders(conversation_id, created_at DESC);

-- Realtime so dashboard can show delivery_failed alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.meta_send_failures;
