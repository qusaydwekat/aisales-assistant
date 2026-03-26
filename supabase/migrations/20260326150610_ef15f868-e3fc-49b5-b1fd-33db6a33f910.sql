
ALTER TABLE public.platform_connections DROP CONSTRAINT IF EXISTS platform_connections_store_id_platform_key;
ALTER TABLE public.platform_connections ADD CONSTRAINT platform_connections_store_page_unique UNIQUE (store_id, platform, page_id);
