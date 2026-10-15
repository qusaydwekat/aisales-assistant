CREATE TABLE public.webhook_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL,
  signature text,
  query_string text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT ON public.webhook_queue TO authenticated;
GRANT ALL ON public.webhook_queue TO service_role;
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read webhook queue" ON public.webhook_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_webhook_queue_due ON public.webhook_queue (status, next_attempt_at);

CREATE OR REPLACE FUNCTION public.claim_webhook_item(_id uuid DEFAULT NULL)
RETURNS SETOF public.webhook_queue
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.webhook_queue q
     SET status = 'processing', attempts = q.attempts + 1, locked_until = now() + interval '5 minutes'
   WHERE q.id = (
     SELECT id FROM public.webhook_queue
      WHERE (_id IS NULL OR id = _id)
        AND ((status IN ('pending','failed') AND next_attempt_at <= now())
             OR (status = 'processing' AND locked_until < now()))
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED)
  RETURNING q.*;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_webhook_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_item(uuid) TO service_role;

SELECT cron.schedule('webhook-queue-cleanup', '17 3 * * *', $$
  DELETE FROM public.webhook_queue WHERE status IN ('done','dead') AND created_at < now() - interval '7 days';
$$);