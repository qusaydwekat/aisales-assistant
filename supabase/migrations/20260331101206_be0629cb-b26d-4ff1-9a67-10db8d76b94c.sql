
-- Add paid_until column to profiles
ALTER TABLE public.profiles ADD COLUMN paid_until timestamp with time zone DEFAULT NULL;

-- Create subscription_payments table for payment history
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  paid_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  confirmed_by uuid,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage subscription payments"
  ON public.subscription_payments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Users can view their own payments
CREATE POLICY "Users can view own payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
