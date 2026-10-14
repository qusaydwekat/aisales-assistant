CREATE OR REPLACE FUNCTION public.protect_profile_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'pending';
      NEW.paid_until := NULL;
    ELSE
      NEW.status := OLD.status;
      NEW.paid_until := OLD.paid_until;
    END IF;
  ELSIF TG_OP = 'INSERT' AND auth.uid() IS NULL THEN
    NEW.status := 'pending';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER protect_profile_status_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_status();