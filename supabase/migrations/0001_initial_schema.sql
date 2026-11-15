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
