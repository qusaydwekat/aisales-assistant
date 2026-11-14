DROP POLICY IF EXISTS "Public can view stores" ON public.stores;

CREATE OR REPLACE FUNCTION public.get_public_store(_store_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, description text, logo_url text, cover_image_url text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.description, s.logo_url, s.cover_image_url, s.phone
  FROM public.stores s
  WHERE _store_id IS NULL OR s.id = _store_id
  ORDER BY s.created_at
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_store(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated users can upload store assets" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploads" ON storage.objects;

CREATE POLICY "Users upload to own folder in store assets" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));

CREATE POLICY "Users update own store assets" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = (select auth.uid()::text))
WITH CHECK (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));

CREATE POLICY "Users delete own store assets" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'store-assets' AND (storage.foldername(name))[1] = (select auth.uid()::text));