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
