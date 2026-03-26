-- Allow public (unauthenticated) read access to products for storefront
CREATE POLICY "Public can view active products"
ON public.products FOR SELECT TO anon
USING (active = true);

-- Allow public read access to stores for storefront
CREATE POLICY "Public can view stores"
ON public.stores FOR SELECT TO anon
USING (true);