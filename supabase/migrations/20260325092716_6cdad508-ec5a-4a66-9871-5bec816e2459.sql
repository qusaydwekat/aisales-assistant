
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'store_owner');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.conversation_status AS ENUM ('open', 'resolved', 'pending_order');
CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE public.platform_type AS ENUM ('facebook', 'instagram', 'whatsapp');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  status user_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admin can view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Admin can view all roles
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- ============ STORES ============
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  cover_image_url TEXT DEFAULT '',
  category TEXT DEFAULT '',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  working_hours JSONB DEFAULT '{}',
  delivery_info TEXT DEFAULT '',
  return_policy TEXT DEFAULT '',
  payment_methods TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own store" ON public.stores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own store" ON public.stores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own store" ON public.stores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all stores" ON public.stores FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  compare_price NUMERIC(10,2),
  images TEXT[] DEFAULT '{}',
  stock INTEGER NOT NULL DEFAULT 0,
  sku TEXT DEFAULT '',
  variants JSONB DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their products" ON public.products FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert products" ON public.products FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update products" ON public.products FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can delete products" ON public.products FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = products.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Admins can view all products" ON public.products FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  status conversation_status NOT NULL DEFAULT 'open',
  last_message TEXT DEFAULT '',
  last_message_time TIMESTAMPTZ DEFAULT now(),
  unread BOOLEAN NOT NULL DEFAULT true,
  platform_conversation_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their conversations" ON public.conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = conversations.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update conversations" ON public.conversations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = conversations.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert conversations" ON public.conversations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = conversations.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Admins can view all conversations" ON public.conversations FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'ai', 'owner')),
  content TEXT NOT NULL,
  platform_message_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their messages" ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.stores s ON s.id = c.store_id
    WHERE c.id = messages.conversation_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Store owners can insert messages" ON public.messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.stores s ON s.id = c.store_id
    WHERE c.id = messages.conversation_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "Admins can view all messages" ON public.messages FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ ORDERS ============
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]',
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'pending',
  platform platform_type,
  notes TEXT DEFAULT '',
  order_number TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their orders" ON public.orders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert orders" ON public.orders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update orders" ON public.orders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = orders.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ PLATFORM CONNECTIONS ============
CREATE TABLE public.platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  credentials JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disconnected',
  page_name TEXT DEFAULT '',
  page_id TEXT DEFAULT '',
  last_synced_at TIMESTAMPTZ,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, platform)
);

ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their connections" ON public.platform_connections FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = platform_connections.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert connections" ON public.platform_connections FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = platform_connections.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update connections" ON public.platform_connections FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = platform_connections.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can delete connections" ON public.platform_connections FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = platform_connections.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Admins can view all connections" ON public.platform_connections FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'message',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- ============ AI SETTINGS ============
CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  persona_name TEXT NOT NULL DEFAULT 'Sara',
  language TEXT NOT NULL DEFAULT 'both',
  tone TEXT NOT NULL DEFAULT 'friendly',
  auto_reply BOOLEAN NOT NULL DEFAULT true,
  response_delay INTEGER NOT NULL DEFAULT 2,
  fallback_message TEXT DEFAULT 'I''m not sure about that. Let me connect you with the store owner.',
  escalation_threshold INTEGER NOT NULL DEFAULT 5,
  greeting_facebook TEXT DEFAULT 'Hello! Welcome to our store. How can I help you today?',
  greeting_instagram TEXT DEFAULT 'Hey! 👋 Thanks for reaching out. What can I help you with?',
  greeting_whatsapp TEXT DEFAULT 'Hi there! Welcome. How may I assist you?',
  order_confirmation_template TEXT DEFAULT 'Your order has been confirmed! We''ll keep you updated on the status.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can view their AI settings" ON public.ai_settings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = ai_settings.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can insert AI settings" ON public.ai_settings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = ai_settings.store_id AND stores.user_id = auth.uid()));
CREATE POLICY "Store owners can update AI settings" ON public.ai_settings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.stores WHERE stores.id = ai_settings.store_id AND stores.user_id = auth.uid()));

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_connections_updated_at BEFORE UPDATE ON public.platform_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'store_owner');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AUTO-GENERATE ORDER NUMBER ============
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number = 'ORD-' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- ============ INDEXES ============
CREATE INDEX idx_products_store_id ON public.products(store_id);
CREATE INDEX idx_conversations_store_id ON public.conversations(store_id);
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_orders_store_id ON public.orders(store_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(read);

-- ============ STORAGE BUCKET ============
INSERT INTO storage.buckets (id, name, public) VALUES ('store-assets', 'store-assets', true);

CREATE POLICY "Anyone can view store assets" ON storage.objects FOR SELECT USING (bucket_id = 'store-assets');
CREATE POLICY "Authenticated users can upload store assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'store-assets' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their uploads" ON storage.objects FOR UPDATE USING (bucket_id = 'store-assets' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete their uploads" ON storage.objects FOR DELETE USING (bucket_id = 'store-assets' AND auth.role() = 'authenticated');
