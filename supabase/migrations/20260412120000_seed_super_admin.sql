-- Seed a super-admin account (email/password auth).
-- Idempotent: skips if auth.users already has this email.
--
-- Security note: rotate this password after first deploy if the migration file is in version control.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  admin_email constant text := 'admin@aisales.com';
  admin_password constant text := 'Admin123!';
  new_id uuid := gen_random_uuid();
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = admin_email) THEN
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    admin_email,
    crypt(admin_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Super Admin'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_id,
    jsonb_build_object('sub', new_id::text, 'email', admin_email),
    'email',
    new_id::text,
    now(),
    now(),
    now()
  );

  -- handle_new_user() inserts store_owner; super admin should not be a store_owner row.
  DELETE FROM public.user_roles
  WHERE user_id = new_id AND role = 'store_owner';

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_id, 'admin');

  UPDATE public.profiles
  SET
    full_name = 'Super Admin',
    status = 'active'
  WHERE user_id = new_id;
END;
$$;
