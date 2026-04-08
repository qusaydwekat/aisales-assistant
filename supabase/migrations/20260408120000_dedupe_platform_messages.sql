-- Ensure platform_message_id can be nullable and dedupe reliably
ALTER TABLE public.messages
  ALTER COLUMN platform_message_id DROP DEFAULT;

UPDATE public.messages
SET platform_message_id = NULL
WHERE platform_message_id = '';

-- Prevent duplicate processing on webhook retries:
-- A platform message id should be unique per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_conversation_platform_message_id_unique
  ON public.messages (conversation_id, platform_message_id)
  WHERE platform_message_id IS NOT NULL;

