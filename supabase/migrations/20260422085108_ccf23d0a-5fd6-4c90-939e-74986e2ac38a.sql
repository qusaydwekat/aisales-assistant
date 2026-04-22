
CREATE TABLE public.platform_ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'openai',
  model text NOT NULL DEFAULT 'gpt-4o',
  autofill_model text NOT NULL DEFAULT 'gpt-4o-mini',
  test_model text NOT NULL DEFAULT 'gpt-4o-mini',
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.platform_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ai config"
ON public.platform_ai_config FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ai config"
ON public.platform_ai_config FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ai config"
ON public.platform_ai_config FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER platform_ai_config_updated_at
BEFORE UPDATE ON public.platform_ai_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_ai_config (provider, model, autofill_model, test_model)
VALUES ('openai', 'gpt-4o', 'gpt-4o-mini', 'gpt-4o-mini');
