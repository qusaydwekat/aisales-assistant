-- Performance: composite/specialized indexes for hot query paths

-- Conversations: list by store ordered by last_message_time DESC, and unread count filter
CREATE INDEX IF NOT EXISTS idx_conversations_store_last_msg
  ON public.conversations (store_id, last_message_time DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_store_unread
  ON public.conversations (store_id)
  WHERE unread = true;

-- Conversations lookup by platform identity (used in webhook routing)
CREATE INDEX IF NOT EXISTS idx_conversations_store_platform_pageid
  ON public.conversations (store_id, platform, page_id, platform_conversation_id);

-- Messages: conversation timeline queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at);

-- Orders: store + status filters & date range
CREATE INDEX IF NOT EXISTS idx_orders_store_created
  ON public.orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_status
  ON public.orders (store_id, status);

-- Products: active filter for storefront / catalog summaries
CREATE INDEX IF NOT EXISTS idx_products_store_active
  ON public.products (store_id)
  WHERE active = true;

-- Notifications: unread count filter
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE read = false;

-- Platform connections: route lookup by page_id
CREATE INDEX IF NOT EXISTS idx_platform_connections_page
  ON public.platform_connections (platform, page_id);

-- AI batch log: per-store recent activity
CREATE INDEX IF NOT EXISTS idx_ai_message_batch_log_store_created
  ON public.ai_message_batch_log (store_id, created_at DESC);
