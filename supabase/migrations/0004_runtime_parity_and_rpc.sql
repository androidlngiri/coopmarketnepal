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
