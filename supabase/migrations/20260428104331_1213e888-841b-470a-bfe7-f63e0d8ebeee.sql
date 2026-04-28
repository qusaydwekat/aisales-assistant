-- Enable pgvector for visual similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Products: visual attribute columns ───
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS color text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS pattern text,
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS fit text,
  ADD COLUMN IF NOT EXISTS occasion text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sleeve text,
  ADD COLUMN IF NOT EXISTS neckline text,
  ADD COLUMN IF NOT EXISTS length text,
  ADD COLUMN IF NOT EXISTS sizes_available text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS stock_per_size jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_description text,
  ADD COLUMN IF NOT EXISTS image_embedding vector(1536);

-- ─── Orders: product snapshot for immutability ───
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb;

-- ─── Post → Product linking ───
CREATE TABLE IF NOT EXISTS public.post_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  platform text NOT NULL,
  page_id text NOT NULL DEFAULT '',
  post_id text NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, platform, post_id)
);

CREATE INDEX IF NOT EXISTS idx_post_product_links_lookup
  ON public.post_product_links (store_id, platform, post_id);

ALTER TABLE public.post_product_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all post links"
  ON public.post_product_links FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Store owners can view their post links"
  ON public.post_product_links FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = post_product_links.store_id AND stores.user_id = auth.uid()
  ));

CREATE POLICY "Store owners can insert their post links"
  ON public.post_product_links FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = post_product_links.store_id AND stores.user_id = auth.uid()
  ));

CREATE POLICY "Store owners can update their post links"
  ON public.post_product_links FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = post_product_links.store_id AND stores.user_id = auth.uid()
  ));

CREATE POLICY "Store owners can delete their post links"
  ON public.post_product_links FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM stores
    WHERE stores.id = post_product_links.store_id AND stores.user_id = auth.uid()
  ));

CREATE TRIGGER post_product_links_updated_at
  BEFORE UPDATE ON public.post_product_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RPC for visual similarity search ───
-- Returns products ranked by cosine similarity to a query embedding,
-- restricted to a single store and only active products.
CREATE OR REPLACE FUNCTION public.match_products_by_image(
  _store_id uuid,
  _query_embedding vector(1536),
  _match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    1 - (p.image_embedding <=> _query_embedding) AS similarity
  FROM public.products p
  WHERE p.store_id = _store_id
    AND p.active = true
    AND p.image_embedding IS NOT NULL
  ORDER BY p.image_embedding <=> _query_embedding ASC
  LIMIT _match_count;
$$;