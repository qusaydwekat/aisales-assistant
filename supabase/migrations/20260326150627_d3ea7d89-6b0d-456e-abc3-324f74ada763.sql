
-- Clean up old disconnected records with empty credentials that are blocking new connections
DELETE FROM public.platform_connections WHERE status = 'disconnected' AND (credentials IS NULL OR credentials = '{}'::jsonb);
