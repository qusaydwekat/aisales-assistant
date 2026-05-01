-- ============ PROMOTIONS ============
CREATE TABLE public.promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'percent', -- percent | fixed | free_shipping
  value NUMERIC NOT NULL DEFAULT 0,
  min_order NUMERIC NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER,
  uses INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT NOT NULL DEFAULT 'all', -- all | category | products
  applies_value JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, code)
);
CREATE INDEX idx_promotions_store ON public.promotions(store_id);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all promotions" ON public.promotions
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Store owners can view their promotions" ON public.promotions
  FOR SELECT USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = promotions.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert promotions" ON public.promotions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM stores WHERE stores.id = promotions.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update promotions" ON public.promotions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = promotions.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can delete promotions" ON public.promotions
  FOR DELETE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = promotions.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Public can view active promotions" ON public.promotions
  FOR SELECT TO anon USING (active = true);

CREATE TRIGGER update_promotions_updated_at BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ KNOWLEDGE GAPS ============
CREATE TABLE public.knowledge_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL,
  conversation_id UUID,
  customer_question TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'open', -- open | answered | dismissed
  answer TEXT,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_knowledge_gaps_store_status ON public.knowledge_gaps(store_id, status);
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all knowledge gaps" ON public.knowledge_gaps
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Store owners can view their knowledge gaps" ON public.knowledge_gaps
  FOR SELECT USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = knowledge_gaps.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update knowledge gaps" ON public.knowledge_gaps
  FOR UPDATE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = knowledge_gaps.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can delete knowledge gaps" ON public.knowledge_gaps
  FOR DELETE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = knowledge_gaps.store_id AND stores.user_id = auth.uid()));

CREATE TRIGGER update_knowledge_gaps_updated_at BEFORE UPDATE ON public.knowledge_gaps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RESTOCK SIGNUPS ============
CREATE TABLE public.restock_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL,
  conversation_id UUID,
  customer_name TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL,
  platform TEXT,
  product_id UUID NOT NULL,
  variant TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | notified | dismissed
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_restock_signups_store_status ON public.restock_signups(store_id, status);
CREATE INDEX idx_restock_signups_product ON public.restock_signups(product_id);
ALTER TABLE public.restock_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all restock signups" ON public.restock_signups
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Store owners can view their restock signups" ON public.restock_signups
  FOR SELECT USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = restock_signups.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update restock signups" ON public.restock_signups
  FOR UPDATE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = restock_signups.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can delete restock signups" ON public.restock_signups
  FOR DELETE USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = restock_signups.store_id AND stores.user_id = auth.uid()));

CREATE TRIGGER update_restock_signups_updated_at BEFORE UPDATE ON public.restock_signups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ EXISTING TABLE EXTENSIONS ============
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS custom_ai_instructions TEXT DEFAULT '';

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS satisfaction TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS satisfaction_asked_at TIMESTAMPTZ;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS dimensions TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS warranty TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ingredients TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS allergens TEXT[] DEFAULT '{}';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS volume TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compatibility TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.post_product_links ADD COLUMN IF NOT EXISTS story_id TEXT;
CREATE INDEX IF NOT EXISTS idx_post_product_links_story ON public.post_product_links(story_id) WHERE story_id IS NOT NULL;