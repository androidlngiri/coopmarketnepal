-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — National Cooperative Marketplace SaaS
-- Migration 0001: Normalized Multi-Tenant PostgreSQL Schema
-- Timezone: Asia/Kathmandu | Encoding: UTF-8 (Devanagari + English)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ----------------------------------------------------------------------------
-- 1. Helper Trigger for updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 2. Profiles, Roles & Platform Administrators
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  full_name_ne TEXT,
  email CITEXT UNIQUE,
  phone TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('super_admin', 'cooperative_admin', 'cooperative_staff', 'buyer')),
  preferred_language TEXT NOT NULL DEFAULT 'ne' CHECK (preferred_language IN ('ne', 'en')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  phone_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_administrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Platform Super Administrator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  provisioned_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. Subscription Plans (Configurable — not hardcoded)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_ne TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ne TEXT,
  description_en TEXT,
  monthly_price_npr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (monthly_price_npr >= 0),
  annual_price_npr NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (annual_price_npr >= 0),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  max_products INTEGER NOT NULL DEFAULT 25 CHECK (max_products >= 1),
  max_staff INTEGER NOT NULL DEFAULT 2 CHECK (max_staff >= 1),
  max_storage_mb INTEGER NOT NULL DEFAULT 250 CHECK (max_storage_mb >= 50),
  features_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. Cooperatives, Documents, Registration History & Staff
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cooperatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name_ne TEXT NOT NULL,
  name_en TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  registration_authority TEXT NOT NULL,
  registration_date_ad DATE NOT NULL,
  registration_date_bs TEXT,
  cooperative_type TEXT NOT NULL CHECK (
    cooperative_type IN ('agriculture', 'dairy', 'multipurpose', 'handicraft', 'consumer', 'savings_credit_producer', 'other')
  ),
  pan_vat_number TEXT,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  municipality TEXT NOT NULL,
  ward_number TEXT NOT NULL,
  tole_address TEXT NOT NULL,
  contact_email CITEXT,
  contact_phone TEXT NOT NULL,
  authorized_rep_name TEXT NOT NULL,
  authorized_rep_designation TEXT NOT NULL,
  logo_url TEXT,
  requested_store_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_otp' CHECK (
    status IN ('pending_otp', 'pending_review', 'approved', 'rejected', 'suspended', 'inactive')
  ),
  rejection_reason TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  otp_verified_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cooperatives_status ON public.cooperatives(status);
CREATE INDEX idx_cooperatives_province_district ON public.cooperatives(province, district);
CREATE INDEX idx_cooperatives_slug ON public.cooperatives(slug);

CREATE TABLE IF NOT EXISTS public.cooperative_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('registration_certificate', 'pan_vat_certificate', 'authorized_id', 'tax_clearance', 'other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  verified_status TEXT NOT NULL DEFAULT 'pending' CHECK (verified_status IN ('pending', 'verified', 'rejected')),
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coop_docs_coop ON public.cooperative_documents(cooperative_id);

CREATE TABLE IF NOT EXISTS public.cooperative_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cooperative_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_role TEXT NOT NULL DEFAULT 'manager' CHECK (staff_role IN ('admin', 'manager', 'inventory_clerk', 'order_fulfillment', 'viewer')),
  permissions_json JSONB NOT NULL DEFAULT '{
    "manage_products": true,
    "manage_orders": true,
    "manage_inventory": true,
    "manage_store": false,
    "manage_staff": false,
    "view_reports": true,
    "manage_settings": false
  }'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, user_id)
);

CREATE INDEX idx_coop_staff_user ON public.cooperative_staff(user_id);

-- ----------------------------------------------------------------------------
-- 5. Cooperative Subscriptions & Billing
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('trial', 'monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'expired', 'suspended', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_coop_status ON public.subscriptions(cooperative_id, status);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  amount_npr NUMERIC(12, 2) NOT NULL CHECK (amount_npr >= 0),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'qr_manual', 'cash', 'fonepay', 'connectips')),
  reference_number TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. Stores & Visual Store Builder
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL UNIQUE REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  store_name_ne TEXT NOT NULL,
  store_name_en TEXT NOT NULL,
  tagline_ne TEXT,
  tagline_en TEXT,
  theme_key TEXT NOT NULL DEFAULT 'himalayan_stone' CHECK (
    theme_key IN ('himalayan_stone', 'ilam_emerald', 'palpa_crimson', 'mustang_slate')
  ),
  primary_color TEXT NOT NULL DEFAULT '#B91C1C',
  accent_color TEXT NOT NULL DEFAULT '#15803D',
  font_key TEXT NOT NULL DEFAULT 'noto_jakarta' CHECK (
    font_key IN ('noto_jakarta', 'serif_editorial', 'modern_outfit')
  ),
  logo_url TEXT,
  banner_url TEXT,
  intro_ne TEXT,
  intro_en TEXT,
  mission_ne TEXT,
  mission_en TEXT,
  vision_ne TEXT,
  vision_en TEXT,
  notice_ne TEXT,
  notice_en TEXT,
  footer_text_ne TEXT,
  footer_text_en TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address_text TEXT,
  social_links_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_config_json JSONB,
  custom_domain TEXT UNIQUE,
  custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. Categories, Products & Inventory
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_ne TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ne TEXT,
  description_en TEXT,
  parent_id UUID REFERENCES public.global_categories(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cooperative_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_ne TEXT NOT NULL,
  name_en TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, slug)
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  global_category_id UUID REFERENCES public.global_categories(id) ON DELETE SET NULL,
  coop_category_id UUID REFERENCES public.cooperative_categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  sku TEXT NOT NULL,
  name_ne TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_ne TEXT,
  description_en TEXT,
  price_npr NUMERIC(12, 2) NOT NULL CHECK (price_npr >= 0),
  discount_price_npr NUMERIC(12, 2) CHECK (discount_price_npr IS NULL OR discount_price_npr >= 0),
  unit_label_ne TEXT NOT NULL DEFAULT 'के.जी.',
  unit_label_en TEXT NOT NULL DEFAULT 'kg',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  availability_status TEXT NOT NULL DEFAULT 'in_stock' CHECK (availability_status IN ('in_stock', 'out_of_stock', 'preorder')),
  origin_district TEXT,
  producer_name TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_platform_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_prohibited BOOLEAN NOT NULL DEFAULT FALSE,
  prohibition_reason TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, sku)
);

CREATE INDEX idx_products_coop_status ON public.products(cooperative_id, status);
CREATE INDEX idx_products_category ON public.products(global_category_id);
CREATE INDEX idx_products_slug ON public.products(slug);

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('initial', 'restock', 'order_deduction', 'order_restock', 'adjustment', 'damage')),
  quantity_delta INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL,
  reference_id TEXT,
  note TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_product ON public.inventory_movements(product_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 8. Buyers, Addresses, Wishlists & Carts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  province TEXT NOT NULL,
  district TEXT NOT NULL,
  municipality TEXT NOT NULL,
  ward_number TEXT NOT NULL,
  street_address TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- ----------------------------------------------------------------------------
-- 9. Delivery Configs & Promotions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL UNIQUE REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  delivery_areas_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_fee_npr NUMERIC(10, 2) NOT NULL DEFAULT 100,
  free_delivery_threshold_npr NUMERIC(12, 2) NOT NULL DEFAULT 2500,
  minimum_order_npr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_address_ne TEXT,
  pickup_address_en TEXT,
  delivery_instructions_ne TEXT,
  delivery_instructions_en TEXT,
  bank_payment_instructions_ne TEXT,
  bank_payment_instructions_en TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title_ne TEXT NOT NULL,
  title_en TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC(12, 2) NOT NULL CHECK (discount_value > 0),
  min_order_npr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, code)
);

-- ----------------------------------------------------------------------------
-- 10. Multi-Cooperative Orders, Items & Payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_group_id UUID NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL UNIQUE,
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE RESTRICT,
  buyer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_guest BOOLEAN NOT NULL DEFAULT TRUE,
  guest_access_token TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'delivery' CHECK (delivery_mode IN ('delivery', 'pickup')),
  delivery_province TEXT,
  delivery_district TEXT,
  delivery_municipality TEXT,
  delivery_ward TEXT,
  delivery_address TEXT,
  delivery_note TEXT,
  subtotal_npr NUMERIC(12, 2) NOT NULL,
  discount_npr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  delivery_fee_npr NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_npr NUMERIC(12, 2) NOT NULL,
  promo_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded')
  ),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cod', 'bank_transfer', 'qr_manual', 'fonepay', 'nepalpay_qr', 'connectips')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'submitted', 'verified', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cooperative_id, idempotency_key)
);

CREATE INDEX idx_orders_coop_created ON public.orders(cooperative_id, created_at DESC);
CREATE INDEX idx_orders_buyer ON public.orders(buyer_user_id);
CREATE INDEX idx_orders_number ON public.orders(order_number);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_ne TEXT NOT NULL,
  product_name_en TEXT NOT NULL,
  sku TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  unit_price_npr NUMERIC(12, 2) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  line_total_npr NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE RESTRICT,
  method TEXT NOT NULL,
  amount_npr NUMERIC(12, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'verified', 'failed', 'refunded')),
  transaction_reference TEXT,
  gateway_payload_json JSONB,
  verified_by UUID REFERENCES public.profiles(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. OTP, Akash SMS Logs, Notifications, Audit Logs & Support
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('coop_registration', 'login', 'guest_checkout', 'phone_change')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'akash_sms',
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'unconfigured')),
  provider_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  cooperative_id UUID REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_ne TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_ne TEXT NOT NULL,
  body_en TEXT NOT NULL,
  action_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  cooperative_id UUID REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0002: Row Level Security (RLS)
-- Mandatory Multi-Tenant Isolation & RBAC Enforcement
-- ============================================================================

-- Helper: Check if current authenticated user is a verified active Super Admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.platform_administrators pa ON pa.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
      AND p.is_active = TRUE
      AND pa.is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: Check if current user owns or works for cooperative_id
CREATE OR REPLACE FUNCTION public.is_coop_member(target_coop_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cooperatives c
    WHERE c.id = target_coop_id AND c.owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.cooperative_staff cs
    WHERE cs.cooperative_id = target_coop_id
      AND cs.user_id = auth.uid()
      AND cs.is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: Check granular staff permission (owner always allowed)
CREATE OR REPLACE FUNCTION public.has_coop_permission(target_coop_id UUID, perm_key TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cooperatives c
    WHERE c.id = target_coop_id AND c.owner_user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.cooperative_staff cs
    WHERE cs.cooperative_id = target_coop_id
      AND cs.user_id = auth.uid()
      AND cs.is_active = TRUE
      AND COALESCE((cs.permissions_json ->> perm_key)::BOOLEAN, FALSE) = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_self_read" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_super_admin());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL
  USING (public.is_super_admin());

-- Subscription Plans (public read active plans, super_admin write)
CREATE POLICY "plans_public_read" ON public.subscription_plans FOR SELECT
  USING (is_active = TRUE OR public.is_super_admin());
CREATE POLICY "plans_admin_write" ON public.subscription_plans FOR ALL
  USING (public.is_super_admin());

-- Cooperatives (public sees ONLY approved cooperatives; members see own; super_admin sees all)
CREATE POLICY "coops_public_approved" ON public.cooperatives FOR SELECT
  USING (status = 'approved' OR public.is_coop_member(id) OR public.is_super_admin());
CREATE POLICY "coops_owner_insert" ON public.cooperatives FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "coops_member_update" ON public.cooperatives FOR UPDATE
  USING (public.has_coop_permission(id, 'manage_settings') OR public.is_super_admin());

-- Cooperative Documents (tenant-isolated + super_admin)
CREATE POLICY "coop_docs_tenant_read" ON public.cooperative_documents FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());
CREATE POLICY "coop_docs_tenant_insert" ON public.cooperative_documents FOR INSERT
  WITH CHECK (public.is_coop_member(cooperative_id));
CREATE POLICY "coop_docs_admin_all" ON public.cooperative_documents FOR ALL
  USING (public.is_super_admin());

-- Cooperative Staff
CREATE POLICY "coop_staff_tenant_read" ON public.cooperative_staff FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());
CREATE POLICY "coop_staff_manage" ON public.cooperative_staff FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_staff') OR public.is_super_admin());

-- Stores (public reads published stores of approved coops; tenant manages own)
CREATE POLICY "stores_public_read" ON public.stores FOR SELECT
  USING (
    (is_published = TRUE AND EXISTS (SELECT 1 FROM public.cooperatives c WHERE c.id = cooperative_id AND c.status = 'approved'))
    OR public.is_coop_member(cooperative_id)
    OR public.is_super_admin()
  );
CREATE POLICY "stores_tenant_manage" ON public.stores FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_store') OR public.is_super_admin());

-- Global Categories
CREATE POLICY "global_cats_public_read" ON public.global_categories FOR SELECT
  USING (is_active = TRUE OR public.is_super_admin());
CREATE POLICY "global_cats_admin_write" ON public.global_categories FOR ALL
  USING (public.is_super_admin());

-- Cooperative Categories
CREATE POLICY "coop_cats_read" ON public.cooperative_categories FOR SELECT
  USING (is_active = TRUE OR public.is_coop_member(cooperative_id) OR public.is_super_admin());
CREATE POLICY "coop_cats_manage" ON public.cooperative_categories FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products') OR public.is_super_admin());

-- Products (public reads published non-prohibited products of approved coops)
CREATE POLICY "products_public_read" ON public.products FOR SELECT
  USING (
    (status = 'published' AND is_prohibited = FALSE AND EXISTS (SELECT 1 FROM public.cooperatives c WHERE c.id = cooperative_id AND c.status = 'approved'))
    OR public.is_coop_member(cooperative_id)
    OR public.is_super_admin()
  );
CREATE POLICY "products_tenant_manage" ON public.products FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products') OR public.is_super_admin());

-- Product Images & Inventory Movements
CREATE POLICY "product_images_read" ON public.product_images FOR SELECT USING (TRUE);
CREATE POLICY "product_images_tenant_manage" ON public.product_images FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products') OR public.is_super_admin());

CREATE POLICY "inventory_tenant_read" ON public.inventory_movements FOR SELECT
  USING (public.has_coop_permission(cooperative_id, 'manage_inventory') OR public.is_super_admin());
CREATE POLICY "inventory_tenant_insert" ON public.inventory_movements FOR INSERT
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_inventory') OR public.is_super_admin());

-- Buyer Private Data
CREATE POLICY "buyer_addresses_own" ON public.buyer_addresses FOR ALL
  USING (user_id = auth.uid() OR public.is_super_admin());
CREATE POLICY "wishlists_own" ON public.wishlists FOR ALL
  USING (user_id = auth.uid());

-- Orders, Order Items & Payments (strictly tenant-isolated + buyer own; guest uses RPC with token)
CREATE POLICY "orders_tenant_or_buyer_read" ON public.orders FOR SELECT
  USING (
    buyer_user_id = auth.uid()
    OR public.has_coop_permission(cooperative_id, 'manage_orders')
    OR public.is_super_admin()
  );
CREATE POLICY "orders_tenant_update" ON public.orders FOR UPDATE
  USING (public.has_coop_permission(cooperative_id, 'manage_orders') OR public.is_super_admin());

CREATE POLICY "order_items_read" ON public.order_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.buyer_user_id = auth.uid() OR public.has_coop_permission(o.cooperative_id, 'manage_orders')))
    OR public.is_super_admin()
  );

CREATE POLICY "payments_read" ON public.payments FOR SELECT
  USING (public.has_coop_permission(cooperative_id, 'manage_orders') OR public.is_super_admin());

-- Subscriptions & Payments
CREATE POLICY "subscriptions_tenant_read" ON public.subscriptions FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());
CREATE POLICY "subscriptions_admin_write" ON public.subscriptions FOR ALL
  USING (public.is_super_admin());

CREATE POLICY "sub_payments_tenant" ON public.subscription_payments FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());
CREATE POLICY "sub_payments_insert" ON public.subscription_payments FOR INSERT
  WITH CHECK (public.is_coop_member(cooperative_id));

-- Notifications, Audit Logs, Support Tickets, Platform Settings
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT
  USING (recipient_user_id = auth.uid() OR (cooperative_id IS NOT NULL AND public.is_coop_member(cooperative_id)) OR public.is_super_admin());

CREATE POLICY "audit_logs_admin_read" ON public.audit_logs FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "tickets_tenant_or_admin" ON public.support_tickets FOR ALL
  USING (user_id = auth.uid() OR (cooperative_id IS NOT NULL AND public.is_coop_member(cooperative_id)) OR public.is_super_admin());

CREATE POLICY "platform_settings_public_read" ON public.platform_settings FOR SELECT
  USING (key IN ('branding', 'legal_about', 'legal_faq', 'legal_terms', 'legal_privacy', 'announcements'));
CREATE POLICY "platform_settings_admin_all" ON public.platform_settings FOR ALL
  USING (public.is_super_admin());

-- Secure RPC for Guest Order Tracking using unguessable token
CREATE OR REPLACE FUNCTION public.track_guest_order(p_order_number TEXT, p_token TEXT)
RETURNS TABLE (
  order_number TEXT,
  invoice_number TEXT,
  status TEXT,
  payment_method TEXT,
  payment_status TEXT,
  subtotal_npr NUMERIC,
  discount_npr NUMERIC,
  delivery_fee_npr NUMERIC,
  total_npr NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
  SELECT o.order_number, o.invoice_number, o.status, o.payment_method, o.payment_status,
         o.subtotal_npr, o.discount_npr, o.delivery_fee_npr, o.total_npr, o.created_at
  FROM public.orders o
  WHERE o.order_number = p_order_number
    AND o.guest_access_token = p_token;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0003: Supabase Storage Buckets & Policies
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('cooperative-logos', 'cooperative-logos', TRUE),
  ('store-banners', 'store-banners', TRUE),
  ('product-images', 'product-images', TRUE),
  ('cooperative-documents', 'cooperative-documents', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Public read for logos, banners, and product images
CREATE POLICY "public_read_store_assets" ON storage.objects FOR SELECT
  USING (bucket_id IN ('cooperative-logos', 'store-banners', 'product-images'));

-- Tenant-scoped upload: folder prefix must match cooperative_id that user belongs to
CREATE POLICY "tenant_upload_assets" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id IN ('cooperative-logos', 'store-banners', 'product-images', 'cooperative-documents')
    AND auth.role() = 'authenticated'
    AND public.is_coop_member((storage.foldername(name))[1]::uuid)
  );

-- Private cooperative documents readable only by owning cooperative or super_admin
CREATE POLICY "private_read_coop_docs" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cooperative-documents'
    AND (
      public.is_coop_member((storage.foldername(name))[1]::uuid)
      OR public.is_super_admin()
    )
  );
-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0004:
-- Runtime Parity Tables, Complete RLS Policies & Transactional RPC Functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Runtime Tables Needed by Express/Serverless Auth, Order History & Security
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON public.sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_history_order ON public.order_status_history(order_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.login_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  identifier TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_activities_created ON public.login_activities(created_at DESC);

-- Ensure updated_at triggers exist on key mutable tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles', 'subscription_plans', 'cooperatives', 'cooperative_staff',
    'subscriptions', 'stores', 'products', 'delivery_configs', 'orders', 'support_tickets'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || tbl || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
        'trg_' || tbl || '_updated_at',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Complete RLS Coverage for Newly Added & Existing Tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_own_or_admin" ON public.sessions;
CREATE POLICY "sessions_own_or_admin" ON public.sessions FOR ALL
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "order_history_read" ON public.order_status_history;
CREATE POLICY "order_history_read" ON public.order_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (o.buyer_user_id = auth.uid() OR public.has_coop_permission(o.cooperative_id, 'manage_orders'))
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "login_activities_admin_read" ON public.login_activities;
CREATE POLICY "login_activities_admin_read" ON public.login_activities FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "platform_admins_read" ON public.platform_administrators;
CREATE POLICY "platform_admins_read" ON public.platform_administrators FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "coop_status_history_read" ON public.cooperative_status_history;
CREATE POLICY "coop_status_history_read" ON public.cooperative_status_history FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "delivery_configs_public_read" ON public.delivery_configs;
CREATE POLICY "delivery_configs_public_read" ON public.delivery_configs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.cooperatives c WHERE c.id = cooperative_id AND c.status = 'approved')
    OR public.is_coop_member(cooperative_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "delivery_configs_tenant_manage" ON public.delivery_configs;
CREATE POLICY "delivery_configs_tenant_manage" ON public.delivery_configs FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_settings') OR public.is_super_admin());

DROP POLICY IF EXISTS "promotions_tenant_manage" ON public.promotions;
CREATE POLICY "promotions_tenant_manage" ON public.promotions FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_settings') OR public.is_super_admin());

DROP POLICY IF EXISTS "sms_logs_admin_read" ON public.sms_logs;
CREATE POLICY "sms_logs_admin_read" ON public.sms_logs FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "support_messages_participant_read" ON public.support_messages;
CREATE POLICY "support_messages_participant_read" ON public.support_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets st
      WHERE st.id = ticket_id
        AND (st.user_id = auth.uid() OR (st.cooperative_id IS NOT NULL AND public.is_coop_member(st.cooperative_id)))
    )
    OR public.is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- 3. Atomic Multi-Cooperative Order Placement & Stock Deduction RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_multi_coop_checkout(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_idem_key TEXT := NULLIF(LEFT(COALESCE(p_payload->>'idempotencyKey', ''), 64), '');
  v_existing JSONB;
  v_checkout_group_id UUID := gen_random_uuid();
  v_buyer_user_id UUID := NULLIF(p_payload->>'buyerUserId', '')::UUID;
  v_customer_name TEXT := BTRIM(COALESCE(p_payload->>'customerName', ''));
  v_customer_phone TEXT := BTRIM(COALESCE(p_payload->>'customerPhone', ''));
  v_customer_email TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'customerEmail', '')), '');
  v_province TEXT := NULLIF(p_payload->>'deliveryProvince', '');
  v_district TEXT := NULLIF(p_payload->>'deliveryDistrict', '');
  v_municipality TEXT := NULLIF(p_payload->>'deliveryMunicipality', '');
  v_ward TEXT := NULLIF(p_payload->>'deliveryWard', '');
  v_address TEXT := NULLIF(p_payload->>'deliveryAddress', '');
  v_note TEXT := NULLIF(p_payload->>'deliveryNote', '');
  v_payment_method TEXT := COALESCE(p_payload->>'paymentMethod', 'cod');
  v_payment_ref TEXT := NULLIF(BTRIM(COALESCE(p_payload->>'paymentReference', '')), '');
  v_initial_payment_status TEXT;
  v_coop_rec RECORD;
  v_item JSONB;
  v_prod RECORD;
  v_deliv RECORD;
  v_promo RECORD;
  v_sub_id UUID;
  v_qty INTEGER;
  v_unit_price NUMERIC(12, 2);
  v_line_total NUMERIC(12, 2);
  v_subtotal NUMERIC(12, 2);
  v_discount NUMERIC(12, 2);
  v_after_discount NUMERIC(12, 2);
  v_delivery_fee NUMERIC(12, 2);
  v_total NUMERIC(12, 2);
  v_promo_code TEXT;
  v_delivery_mode TEXT;
  v_order_id UUID;
  v_suffix TEXT;
  v_order_number TEXT;
  v_invoice_number TEXT;
  v_guest_token TEXT;
  v_new_qty INTEGER;
  v_created_orders JSONB := '[]'::jsonb;
BEGIN
  IF v_idem_key IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object(
      'checkout_group_id', checkout_group_id,
      'order_number', order_number,
      'guest_access_token', guest_access_token,
      'total_npr', total_npr,
      'cooperative_id', cooperative_id
    )) INTO v_existing
    FROM public.orders
    WHERE idempotency_key = v_idem_key;

    IF v_existing IS NOT NULL AND jsonb_array_length(v_existing) > 0 THEN
      RETURN jsonb_build_object('duplicatePrevented', TRUE, 'orders', v_existing);
    END IF;
  END IF;

  IF p_payload->'groups' IS NULL OR jsonb_array_length(p_payload->'groups') = 0 THEN
    RAISE EXCEPTION 'कार्ट खाली छ।';
  END IF;

  v_initial_payment_status := CASE
    WHEN v_payment_method IN ('bank_transfer', 'qr_manual') AND v_payment_ref IS NOT NULL THEN 'submitted'
    ELSE 'pending'
  END;

  FOR v_coop_rec IN
    SELECT
      (g->>'cooperativeId')::UUID AS cooperative_id,
      COALESCE(g->>'deliveryMode', 'delivery') AS delivery_mode,
      NULLIF(UPPER(BTRIM(COALESCE(g->>'promoCode', ''))), '') AS promo_code,
      g->'items' AS items
    FROM jsonb_array_elements(p_payload->'groups') AS g
  LOOP
    -- Verify cooperative is approved & store is published
    SELECT c.id, c.status, c.name_ne, c.name_en, s.store_name_ne, s.store_name_en, s.is_published
    INTO v_prod
    FROM public.cooperatives c
    JOIN public.stores s ON s.cooperative_id = c.id
    WHERE c.id = v_coop_rec.cooperative_id;

    IF NOT FOUND OR v_prod.status <> 'approved' OR NOT v_prod.is_published THEN
      RAISE EXCEPTION 'सहकारी पसल स्वीकृत वा प्रकाशित छैन।';
    END IF;

    -- Verify active subscription
    SELECT id INTO v_sub_id
    FROM public.subscriptions
    WHERE cooperative_id = v_coop_rec.cooperative_id
      AND status IN ('trial', 'active')
      AND ends_at > NOW()
    LIMIT 1;

    IF v_sub_id IS NULL THEN
      RAISE EXCEPTION '% को सदस्यता अवधि सक्रिय छैन।', v_prod.name_ne;
    END IF;

    SELECT * INTO v_deliv FROM public.delivery_configs WHERE cooperative_id = v_coop_rec.cooperative_id;

    v_delivery_mode := CASE
      WHEN v_coop_rec.delivery_mode = 'pickup' AND COALESCE(v_deliv.pickup_enabled, FALSE) THEN 'pickup'
      ELSE 'delivery'
    END;

    IF v_delivery_mode = 'delivery' AND (v_province IS NULL OR v_district IS NULL OR v_address IS NULL) THEN
      RAISE EXCEPTION 'डेलिभरीको लागि प्रदेश, जिल्ला र ठेगाना आवश्यक छ।';
    END IF;

    v_order_id := gen_random_uuid();
    v_suffix := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 6));
    v_order_number := 'SB-' || EXTRACT(YEAR FROM TIMEZONE('Asia/Kathmandu', NOW()))::INT || '-' || v_suffix;
    v_invoice_number := 'INV-' || EXTRACT(YEAR FROM TIMEZONE('Asia/Kathmandu', NOW()))::INT || '-' || v_suffix;
    v_guest_token := ENCODE(extensions.gen_random_bytes(24), 'hex');
    v_subtotal := 0;

    -- Pass 1: Lock products, validate stock & compute subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_coop_rec.items)
    LOOP
      v_qty := FLOOR((v_item->>'quantity')::NUMERIC)::INT;
      IF v_qty < 1 OR v_qty > 500 THEN
        RAISE EXCEPTION 'अमान्य उत्पादन परिमाण।';
      END IF;

      SELECT id, cooperative_id, sku, name_ne, name_en, unit_label_ne, price_npr, discount_price_npr,
             stock_quantity, low_stock_threshold, status, is_prohibited
      INTO v_prod
      FROM public.products
      WHERE id = (v_item->>'productId')::UUID
        AND cooperative_id = v_coop_rec.cooperative_id
      FOR UPDATE;

      IF NOT FOUND OR v_prod.status <> 'published' OR v_prod.is_prohibited THEN
        RAISE EXCEPTION 'उत्पादन हाल उपलब्ध छैन।';
      END IF;

      IF v_prod.stock_quantity < v_qty THEN
        RAISE EXCEPTION '"%" को स्टक अपुग छ (उपलब्ध: %)।', v_prod.name_ne, v_prod.stock_quantity;
      END IF;

      v_unit_price := CASE
        WHEN v_prod.discount_price_npr IS NOT NULL AND v_prod.discount_price_npr > 0 THEN v_prod.discount_price_npr
        ELSE v_prod.price_npr
      END;
      v_line_total := ROUND(v_unit_price * v_qty, 2);
      v_subtotal := ROUND(v_subtotal + v_line_total, 2);
    END LOOP;

    IF COALESCE(v_deliv.minimum_order_npr, 0) > 0 AND v_subtotal < v_deliv.minimum_order_npr THEN
      RAISE EXCEPTION 'न्यूनतम अर्डर रकम रु. % छ।', v_deliv.minimum_order_npr;
    END IF;

    -- Promo code check & atomic increment
    v_discount := 0;
    v_promo_code := NULL;
    IF v_coop_rec.promo_code IS NOT NULL THEN
      SELECT * INTO v_promo
      FROM public.promotions
      WHERE cooperative_id = v_coop_rec.cooperative_id
        AND UPPER(code) = v_coop_rec.promo_code
        AND is_active = TRUE
        AND starts_at <= NOW()
        AND ends_at >= NOW()
        AND (max_uses IS NULL OR used_count < max_uses)
      FOR UPDATE;

      IF FOUND AND v_subtotal >= v_promo.min_order_npr THEN
        v_promo_code := v_coop_rec.promo_code;
        v_discount := CASE
          WHEN v_promo.discount_type = 'percentage' THEN ROUND((v_subtotal * v_promo.discount_value) / 100.0, 2)
          ELSE LEAST(v_subtotal, v_promo.discount_value)
        END;
        UPDATE public.promotions SET used_count = used_count + 1 WHERE id = v_promo.id;
      END IF;
    END IF;

    v_after_discount := GREATEST(0, v_subtotal - v_discount);
    IF v_delivery_mode = 'pickup' THEN
      v_delivery_fee := 0;
    ELSIF COALESCE(v_deliv.free_delivery_threshold_npr, 0) > 0 AND v_after_discount >= v_deliv.free_delivery_threshold_npr THEN
      v_delivery_fee := 0;
    ELSE
      v_delivery_fee := COALESCE(v_deliv.default_fee_npr, 0);
    END IF;
    v_total := ROUND(v_after_discount + v_delivery_fee, 2);

    -- Insert Order
    INSERT INTO public.orders (
      id, checkout_group_id, order_number, invoice_number, cooperative_id,
      buyer_user_id, is_guest, guest_access_token, idempotency_key,
      customer_name, customer_phone, customer_email,
      delivery_mode, delivery_province, delivery_district, delivery_municipality,
      delivery_ward, delivery_address, delivery_note,
      subtotal_npr, discount_npr, delivery_fee_npr, total_npr, promo_code,
      status, payment_method, payment_status
    ) VALUES (
      v_order_id, v_checkout_group_id, v_order_number, v_invoice_number, v_coop_rec.cooperative_id,
      v_buyer_user_id, (v_buyer_user_id IS NULL), v_guest_token, v_idem_key,
      v_customer_name, v_customer_phone, v_customer_email,
      v_delivery_mode, v_province, v_district, v_municipality,
      v_ward, v_address, v_note,
      v_subtotal, v_discount, v_delivery_fee, v_total, v_promo_code,
      'pending', v_payment_method, v_initial_payment_status
    );

    -- Pass 2: Deduct stock, insert order_items, inventory_movements & low-stock alerts
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_coop_rec.items)
    LOOP
      v_qty := FLOOR((v_item->>'quantity')::NUMERIC)::INT;
      SELECT id, sku, name_ne, name_en, unit_label_ne, price_npr, discount_price_npr,
             stock_quantity, low_stock_threshold
      INTO v_prod
      FROM public.products
      WHERE id = (v_item->>'productId')::UUID;

      v_unit_price := CASE
        WHEN v_prod.discount_price_npr IS NOT NULL AND v_prod.discount_price_npr > 0 THEN v_prod.discount_price_npr
        ELSE v_prod.price_npr
      END;
      v_line_total := ROUND(v_unit_price * v_qty, 2);
      v_new_qty := v_prod.stock_quantity - v_qty;

      UPDATE public.products
      SET stock_quantity = v_new_qty,
          availability_status = CASE WHEN v_new_qty = 0 THEN 'out_of_stock' ELSE 'in_stock' END,
          updated_at = NOW()
      WHERE id = v_prod.id;

      INSERT INTO public.order_items (
        order_id, cooperative_id, product_id, product_name_ne, product_name_en,
        sku, unit_label, unit_price_npr, quantity, line_total_npr
      ) VALUES (
        v_order_id, v_coop_rec.cooperative_id, v_prod.id, v_prod.name_ne, v_prod.name_en,
        v_prod.sku, v_prod.unit_label_ne, v_unit_price, v_qty, v_line_total
      );

      INSERT INTO public.inventory_movements (
        cooperative_id, product_id, movement_type, quantity_delta,
        previous_quantity, new_quantity, reference_id, note, created_by
      ) VALUES (
        v_coop_rec.cooperative_id, v_prod.id, 'order_deduction', -v_qty,
        v_prod.stock_quantity, v_new_qty, v_order_number, 'Order ' || v_order_number, v_buyer_user_id
      );

      IF v_new_qty <= v_prod.low_stock_threshold THEN
        INSERT INTO public.notifications (
          cooperative_id, type, title_ne, title_en, body_ne, body_en, action_url
        ) VALUES (
          v_coop_rec.cooperative_id, 'low_stock',
          'कम स्टक चेतावनी', 'Low Stock Alert',
          v_prod.name_ne || ' को मौज्दात ' || v_new_qty || ' मात्र बाँकी छ।',
          v_prod.name_en || ' is down to ' || v_new_qty || ' units.',
          '/cooperative'
        );
      END IF;
    END LOOP;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, note, changed_by)
    VALUES (v_order_id, NULL, 'pending', 'Order placed', v_buyer_user_id);

    INSERT INTO public.payments (order_id, cooperative_id, method, amount_npr, status, transaction_reference)
    VALUES (v_order_id, v_coop_rec.cooperative_id, v_payment_method, v_total, v_initial_payment_status, v_payment_ref);

    SELECT store_name_ne, store_name_en INTO v_prod
    FROM public.stores WHERE cooperative_id = v_coop_rec.cooperative_id;

    INSERT INTO public.notifications (
      cooperative_id, type, title_ne, title_en, body_ne, body_en, action_url
    ) VALUES (
      v_coop_rec.cooperative_id, 'new_order',
      'नयाँ अर्डर प्राप्त भयो', 'New Order Received',
      'अर्डर ' || v_order_number || ' — रु. ' || v_total || ' (' || v_customer_name || ')',
      'Order ' || v_order_number || ' — NPR ' || v_total || ' from ' || v_customer_name,
      '/cooperative'
    );

    v_created_orders := v_created_orders || jsonb_build_array(jsonb_build_object(
      'id', v_order_id,
      'orderNumber', v_order_number,
      'invoiceNumber', v_invoice_number,
      'guestAccessToken', v_guest_token,
      'cooperativeNameNe', v_prod.store_name_ne,
      'cooperativeNameEn', v_prod.store_name_en,
      'totalNpr', v_total,
      'paymentMethod', v_payment_method
    ));
  END LOOP;

  RETURN jsonb_build_object('duplicatePrevented', FALSE, 'orders', v_created_orders);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Atomic Order Status & Automatic Restock RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_coop_order_status(
  p_cooperative_id UUID,
  p_order_id UUID,
  p_status TEXT,
  p_payment_status TEXT,
  p_note TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND cooperative_id = p_cooperative_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'अर्डर फेला परेन।';
  END IF;

  IF p_status IS NOT NULL AND p_status <> '' AND p_status <> v_order.status THEN
    UPDATE public.orders
    SET status = p_status, updated_at = NOW()
    WHERE id = v_order.id AND cooperative_id = p_cooperative_id;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, note, changed_by)
    VALUES (v_order.id, v_order.status, p_status, NULLIF(p_note, ''), p_actor_user_id);

    IF p_status IN ('cancelled', 'returned') AND v_order.status NOT IN ('cancelled', 'returned', 'refunded') THEN
      FOR v_item IN
        SELECT product_id, quantity FROM public.order_items
        WHERE order_id = v_order.id AND cooperative_id = p_cooperative_id
      LOOP
        SELECT stock_quantity INTO v_prod
        FROM public.products WHERE id = v_item.product_id FOR UPDATE;

        v_new_qty := v_prod.stock_quantity + v_item.quantity;
        UPDATE public.products
        SET stock_quantity = v_new_qty, availability_status = 'in_stock', updated_at = NOW()
        WHERE id = v_item.product_id;

        INSERT INTO public.inventory_movements (
          cooperative_id, product_id, movement_type, quantity_delta,
          previous_quantity, new_quantity, reference_id, note, created_by
        ) VALUES (
          p_cooperative_id, v_item.product_id, 'order_restock', v_item.quantity,
          v_prod.stock_quantity, v_new_qty, v_order.order_number,
          'Restocked on order ' || p_status, p_actor_user_id
        );
      END LOOP;
    END IF;
  END IF;

  IF p_payment_status IS NOT NULL AND p_payment_status IN ('pending', 'submitted', 'verified', 'failed', 'refunded') THEN
    UPDATE public.orders
    SET payment_status = p_payment_status, updated_at = NOW()
    WHERE id = v_order.id AND cooperative_id = p_cooperative_id;

    UPDATE public.payments
    SET status = p_payment_status, verified_by = p_actor_user_id, verified_at = NOW()
    WHERE order_id = v_order.id AND cooperative_id = p_cooperative_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'order_number', v_order.order_number,
    'customer_phone', v_order.customer_phone
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Atomic Inventory Stock Adjustment RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_cooperative_id UUID,
  p_product_id UUID,
  p_delta INTEGER,
  p_movement_type TEXT,
  p_note TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod RECORD;
  v_new_qty INTEGER;
BEGIN
  SELECT id, stock_quantity INTO v_prod
  FROM public.products
  WHERE id = p_product_id AND cooperative_id = p_cooperative_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'उत्पादन फेला परेन।';
  END IF;

  v_new_qty := GREATEST(0, v_prod.stock_quantity + p_delta);

  UPDATE public.products
  SET stock_quantity = v_new_qty,
      availability_status = CASE WHEN v_new_qty > 0 THEN 'in_stock' ELSE 'out_of_stock' END,
      updated_at = NOW()
  WHERE id = v_prod.id AND cooperative_id = p_cooperative_id;

  INSERT INTO public.inventory_movements (
    cooperative_id, product_id, movement_type, quantity_delta,
    previous_quantity, new_quantity, note, created_by
  ) VALUES (
    p_cooperative_id, v_prod.id,
    COALESCE(NULLIF(p_movement_type, ''), 'adjustment'),
    v_new_qty - v_prod.stock_quantity,
    v_prod.stock_quantity,
    v_new_qty,
    COALESCE(NULLIF(p_note, ''), 'Manual adjustment'),
    p_actor_user_id
  );

  RETURN jsonb_build_object('ok', TRUE, 'newQuantity', v_new_qty);
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Super Admin Atomic Decisions (Approval, Subscription Assign, Payment Verify)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_or_reject_cooperative(
  p_cooperative_id UUID,
  p_decision TEXT,
  p_reason TEXT,
  p_plan_id UUID,
  p_duration_days INTEGER,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coop RECORD;
  v_existing_sub UUID;
  v_plan RECORD;
  v_days INTEGER;
BEGIN
  SELECT * INTO v_coop FROM public.cooperatives WHERE id = p_cooperative_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'सहकारी फेला परेन।';
  END IF;

  UPDATE public.cooperatives
  SET status = p_decision,
      rejection_reason = NULLIF(p_reason, ''),
      approved_at = CASE WHEN p_decision = 'approved' THEN NOW() ELSE approved_at END,
      approved_by = CASE WHEN p_decision = 'approved' THEN p_actor_user_id ELSE approved_by END,
      updated_at = NOW()
  WHERE id = v_coop.id;

  INSERT INTO public.cooperative_status_history (cooperative_id, from_status, to_status, reason, changed_by)
  VALUES (v_coop.id, v_coop.status, p_decision, COALESCE(NULLIF(p_reason, ''), 'Admin decision: ' || p_decision), p_actor_user_id);

  IF p_decision = 'approved' THEN
    SELECT id INTO v_existing_sub
    FROM public.subscriptions
    WHERE cooperative_id = v_coop.id AND status IN ('trial', 'active') AND ends_at > NOW()
    LIMIT 1;

    IF v_existing_sub IS NULL THEN
      IF p_plan_id IS NOT NULL THEN
        SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
      ELSE
        SELECT * INTO v_plan FROM public.subscription_plans WHERE code = 'free_trial' LIMIT 1;
      END IF;

      IF FOUND THEN
        v_days := COALESCE(NULLIF(p_duration_days, 0), NULLIF(v_plan.trial_days, 0), 30);
        INSERT INTO public.subscriptions (cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
        VALUES (
          v_coop.id,
          v_plan.id,
          CASE WHEN v_days > 0 AND v_plan.trial_days > 0 THEN 'trial' ELSE 'monthly' END,
          CASE WHEN v_days > 0 AND v_plan.trial_days > 0 THEN 'trial' ELSE 'active' END,
          NOW(),
          NOW() + make_interval(days => v_days),
          p_actor_user_id
        );
      END IF;
    END IF;

    UPDATE public.stores
    SET is_published = TRUE, published_at = COALESCE(published_at, NOW()), updated_at = NOW()
    WHERE cooperative_id = v_coop.id;

    UPDATE public.cooperative_documents
    SET verified_status = 'verified', verified_by = p_actor_user_id, verified_at = NOW()
    WHERE cooperative_id = v_coop.id;
  END IF;

  INSERT INTO public.notifications (cooperative_id, recipient_user_id, type, title_ne, title_en, body_ne, body_en, action_url)
  VALUES (
    v_coop.id,
    v_coop.owner_user_id,
    'coop_decision',
    CASE WHEN p_decision = 'approved' THEN 'सहकारी स्वीकृत भयो!' ELSE 'सहकारी स्थिति अद्यावधिक' END,
    CASE WHEN p_decision = 'approved' THEN 'Cooperative Approved!' ELSE 'Cooperative Status Updated' END,
    v_coop.name_ne || ' को स्थिति "' || p_decision || '" मा अद्यावधिक भयो।',
    v_coop.name_en || ' status updated to "' || p_decision || '".',
    '/cooperative'
  );

  INSERT INTO public.audit_logs (actor_user_id, actor_role, cooperative_id, action, entity_type, entity_id, metadata_json)
  VALUES (
    p_actor_user_id, 'super_admin', v_coop.id, 'cooperative_' || p_decision,
    'cooperative', v_coop.id::TEXT, jsonb_build_object('reason', p_reason)
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'contact_phone', v_coop.contact_phone,
    'name_ne', v_coop.name_ne,
    'name_en', v_coop.name_en
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_coop_subscription(
  p_cooperative_id UUID,
  p_plan_id UUID,
  p_billing_cycle TEXT,
  p_duration_days INTEGER,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_days INTEGER;
BEGIN
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'योजना फेला परेन।';
  END IF;

  v_days := COALESCE(NULLIF(p_duration_days, 0), CASE WHEN p_billing_cycle = 'annual' THEN 365 ELSE 30 END);

  UPDATE public.subscriptions
  SET status = 'cancelled', updated_at = NOW()
  WHERE cooperative_id = p_cooperative_id AND status IN ('trial', 'active');

  INSERT INTO public.subscriptions (cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
  VALUES (p_cooperative_id, p_plan_id, COALESCE(NULLIF(p_billing_cycle, ''), 'monthly'), 'active', NOW(), NOW() + make_interval(days => v_days), p_actor_user_id);

  INSERT INTO public.audit_logs (actor_user_id, actor_role, cooperative_id, action, entity_type, entity_id, metadata_json)
  VALUES (
    p_actor_user_id, 'super_admin', p_cooperative_id, 'subscription_assigned',
    'subscription', p_plan_id::TEXT, jsonb_build_object('days', v_days, 'billingCycle', p_billing_cycle)
  );

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_subscription_payment(
  p_payment_id UUID,
  p_decision TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_status TEXT;
  v_days INTEGER;
BEGIN
  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'भुक्तानी फेला परेन।';
  END IF;

  v_status := CASE WHEN p_decision = 'verified' THEN 'verified' ELSE 'rejected' END;

  UPDATE public.subscription_payments
  SET status = v_status, verified_by = p_actor_user_id, verified_at = NOW()
  WHERE id = v_payment.id;

  IF v_status = 'verified' THEN
    v_days := CASE WHEN v_payment.billing_cycle = 'annual' THEN 365 ELSE 30 END;
    UPDATE public.subscriptions
    SET status = 'cancelled', updated_at = NOW()
    WHERE cooperative_id = v_payment.cooperative_id AND status IN ('trial', 'active');

    INSERT INTO public.subscriptions (cooperative_id, plan_id, billing_cycle, status, starts_at, ends_at, assigned_by)
    VALUES (v_payment.cooperative_id, v_payment.plan_id, v_payment.billing_cycle, 'active', NOW(), NOW() + make_interval(days => v_days), p_actor_user_id);
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Dashboard Aggregate & Reporting RPCs (Asia/Kathmandu Timezone)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coop_overview_metrics(p_cooperative_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tz_now AS (
    SELECT TIMEZONE('Asia/Kathmandu', NOW()) AS npt_now
  )
  SELECT jsonb_build_object(
    'metrics', (
      SELECT jsonb_build_object(
        'total_sales', COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END), 0),
        'today_sales', COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND TIMEZONE('Asia/Kathmandu', created_at)::DATE = (SELECT npt_now::DATE FROM tz_now) THEN total_npr ELSE 0 END), 0),
        'monthly_sales', COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') AND TO_CHAR(TIMEZONE('Asia/Kathmandu', created_at), 'YYYY-MM') = TO_CHAR((SELECT npt_now FROM tz_now), 'YYYY-MM') THEN total_npr ELSE 0 END), 0),
        'total_orders', COUNT(*),
        'pending_orders', COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0)
      )
      FROM public.orders WHERE cooperative_id = p_cooperative_id
    ),
    'productStats', (
      SELECT jsonb_build_object(
        'total_products', COUNT(*),
        'published_products', COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0),
        'low_stock_count', COALESCE(SUM(CASE WHEN stock_quantity <= low_stock_threshold THEN 1 ELSE 0 END), 0)
      )
      FROM public.products WHERE cooperative_id = p_cooperative_id
    ),
    'dailySales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d.day, 'revenue', d.revenue, 'order_count', d.order_count) ORDER BY d.day ASC)
      FROM (
        SELECT TO_CHAR(TIMEZONE('Asia/Kathmandu', created_at), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END), 0) AS revenue,
               COUNT(*) AS order_count
        FROM public.orders
        WHERE cooperative_id = p_cooperative_id AND created_at >= NOW() - INTERVAL '14 days'
        GROUP BY 1
      ) d
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_coop_reports(p_cooperative_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('period', m.period, 'orders', m.orders, 'revenue', m.revenue) ORDER BY m.period DESC)
      FROM (
        SELECT TO_CHAR(TIMEZONE('Asia/Kathmandu', created_at), 'YYYY-MM') AS period,
               COUNT(*) AS orders,
               COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','refunded') THEN total_npr ELSE 0 END), 0) AS revenue
        FROM public.orders
        WHERE cooperative_id = p_cooperative_id
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      ) m
    ), '[]'::jsonb),
    'productWise', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sku', p.sku,
        'product_name_ne', p.product_name_ne,
        'product_name_en', p.product_name_en,
        'units_sold', p.units_sold,
        'gross_revenue', p.gross_revenue
      ) ORDER BY p.gross_revenue DESC)
      FROM (
        SELECT MAX(oi.sku) AS sku,
               MAX(oi.product_name_ne) AS product_name_ne,
               MAX(oi.product_name_en) AS product_name_en,
               SUM(oi.quantity)::INT AS units_sold,
               COALESCE(SUM(oi.line_total_npr), 0) AS gross_revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.cooperative_id = p_cooperative_id AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY oi.product_id
      ) p
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_overview_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'coopCounts', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'approved', COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0),
        'pending', COALESCE(SUM(CASE WHEN status IN ('pending_review', 'pending_otp') THEN 1 ELSE 0 END), 0),
        'suspended', COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0),
        'rejected', COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0)
      ) FROM public.cooperatives
    ),
    'subCounts', (
      SELECT jsonb_build_object(
        'active_subs', COALESCE(SUM(CASE WHEN status IN ('trial', 'active') AND ends_at > NOW() THEN 1 ELSE 0 END), 0),
        'expired_subs', COALESCE(SUM(CASE WHEN status = 'expired' OR ends_at <= NOW() THEN 1 ELSE 0 END), 0)
      ) FROM public.subscriptions
    ),
    'marketplaceStats', jsonb_build_object(
      'total_products', (SELECT COUNT(*) FROM public.products WHERE status <> 'archived'),
      'total_orders', (SELECT COUNT(*) FROM public.orders),
      'guest_orders', (SELECT COUNT(*) FROM public.orders WHERE is_guest = TRUE),
      'registered_buyers', (SELECT COUNT(*) FROM public.profiles WHERE role = 'buyer'),
      'gmv_npr', (SELECT COALESCE(SUM(total_npr), 0) FROM public.orders WHERE status NOT IN ('cancelled', 'refunded')),
      'sub_revenue_npr', (SELECT COALESCE(SUM(amount_npr), 0) FROM public.subscription_payments WHERE status = 'verified')
    ),
    'mrrNpr', ROUND(COALESCE((
      SELECT SUM(CASE WHEN s.billing_cycle = 'annual' THEN sp.annual_price_npr / 12.0 ELSE sp.monthly_price_npr END)
      FROM public.subscriptions s
      JOIN public.subscription_plans sp ON sp.id = s.plan_id
      WHERE s.status = 'active' AND s.ends_at > NOW()
    ), 0))
  );
$$;
-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Idempotent Production Seed Data
-- ============================================================================

INSERT INTO public.subscription_plans (code, name_ne, name_en, description_ne, description_en, monthly_price_npr, annual_price_npr, trial_days, max_products, max_staff, max_storage_mb, features_json, sort_order)
VALUES
  ('free_trial', 'निःशुल्क परीक्षण', 'Free Trial', 'नयाँ सहकारीका लागि ३० दिनको पूर्ण परीक्षण योजना', '30-day introductory trial for newly approved cooperatives', 0, 0, 30, 15, 2, 200, '{"custom_domain": false, "reports_export": true, "promotions": false}'::jsonb, 1),
  ('basic', 'आधारभूत योजना', 'Basic', 'साना तथा स्थानीय कृषि र दुग्ध सहकारीका लागि उपयुक्त', 'Built for local agricultural and dairy cooperatives', 999, 9990, 0, 50, 3, 500, '{"custom_domain": false, "reports_export": true, "promotions": true}'::jsonb, 2),
  ('standard', 'मानक योजना', 'Standard', 'बढ्दो सहकारी व्यवसाय र बहु-कर्मचारी व्यवस्थापन', 'Growing cooperatives with multiple staff and coupons', 2499, 24990, 0, 250, 10, 2048, '{"custom_domain": true, "reports_export": true, "promotions": true}'::jsonb, 3),
  ('premium', 'प्रिमियम योजना', 'Premium', 'जिल्ला तथा प्रदेशस्तरीय बृहत् सहकारी संघहरूका लागि', 'District and provincial cooperative unions with full branding', 4999, 49990, 0, 1000, 25, 10240, '{"custom_domain": true, "reports_export": true, "promotions": true, "priority_support": true}'::jsonb, 4),
  ('enterprise', 'उद्यम योजना', 'Enterprise', 'राष्ट्रिय सहकारी महासंघ तथा असीमित व्यापार क्षमता', 'National federations with unlimited scale and dedicated support', 9999, 99990, 0, 10000, 100, 51200, '{"custom_domain": true, "reports_export": true, "promotions": true, "priority_support": true, "api_access": true}'::jsonb, 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.global_categories (slug, name_ne, name_en, sort_order)
VALUES
  ('agriculture-grains', 'कृषि तथा अन्नबाली', 'Agriculture & Grains', 1),
  ('tea-coffee-spices', 'चिया, कफी र मसला', 'Tea, Coffee & Spices', 2),
  ('dairy-ghee-honey', 'दुग्ध, घ्यू र मह', 'Dairy, Ghee & Honey', 3),
  ('handicraft-textiles', 'हस्तकला र ढाका कपडा', 'Handicraft & Textiles', 4),
  ('indigenous-himalayan', 'रैथाने तथा हिमाली उत्पादन', 'Indigenous & Himalayan', 5),
  ('daily-essentials', 'दैनिक उपभोग्य वस्तु', 'Daily Essentials', 6)
ON CONFLICT (slug) DO NOTHING;
