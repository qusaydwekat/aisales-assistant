CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'store_owner');

  -- Auto-create store if store_name provided in metadata
  IF NEW.raw_user_meta_data->>'store_name' IS NOT NULL AND NEW.raw_user_meta_data->>'store_name' != '' THEN
    INSERT INTO public.stores (user_id, name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'store_name');
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_user trigger error: % %', SQLERRM, SQLSTATE;
  RAISE;
END;
$$;