
-- ai_settings: Phase 2 toggles
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS emotion_detection_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS abuse_auto_escalate_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_confidence_threshold integer NOT NULL DEFAULT 65,
  ADD COLUMN IF NOT EXISTS proactive_followup_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS upsell_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quality_score_enabled boolean NOT NULL DEFAULT true;

-- Clamp image_confidence_threshold to 50..80 via trigger (CHECK avoided to keep flexible)
CREATE OR REPLACE FUNCTION public.clamp_image_confidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.image_confidence_threshold IS NULL OR NEW.image_confidence_threshold < 50 THEN
    NEW.image_confidence_threshold := 50;
  ELSIF NEW.image_confidence_threshold > 80 THEN
    NEW.image_confidence_threshold := 80;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clamp_image_confidence_trigger ON public.ai_settings;
CREATE TRIGGER clamp_image_confidence_trigger
  BEFORE INSERT OR UPDATE ON public.ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.clamp_image_confidence();

-- conversations: emotion, escalation, quality
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS current_emotion text NOT NULL DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS handoff_summary text,
  ADD COLUMN IF NOT EXISTS quality_score integer,
  ADD COLUMN IF NOT EXISTS quality_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS last_customer_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_proactive_at timestamptz;

-- ai_message_batch_log: phase 2 analytics
ALTER TABLE public.ai_message_batch_log
  ADD COLUMN IF NOT EXISTS detected_emotion text,
  ADD COLUMN IF NOT EXISTS image_confidence integer;
