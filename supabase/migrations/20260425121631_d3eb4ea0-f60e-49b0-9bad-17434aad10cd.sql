CREATE TABLE IF NOT EXISTS public.openai_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openai_webhook_events_type ON public.openai_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_openai_webhook_events_received_at ON public.openai_webhook_events (received_at DESC);

ALTER TABLE public.openai_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view openai webhook events"
ON public.openai_webhook_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));