-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0005:
-- Enforce Read-Only Super Admin Product Monitoring & Cooperative-Only Writes
-- ============================================================================

-- Products: Super Admin keeps SELECT via products_public_read,
-- but ONLY owning cooperative staff with 'manage_products' can write.
DROP POLICY IF EXISTS "products_tenant_manage" ON public.products;
CREATE POLICY "products_tenant_manage" ON public.products FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products'))
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_products'));

-- Product Images: Cooperative-only writes; public/admin SELECT preserved.
DROP POLICY IF EXISTS "product_images_tenant_manage" ON public.product_images;
CREATE POLICY "product_images_tenant_manage" ON public.product_images FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products'))
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_products'));

-- Cooperative Store Categories: Cooperative-only writes; public/admin SELECT preserved.
DROP POLICY IF EXISTS "coop_cats_manage" ON public.cooperative_categories;
CREATE POLICY "coop_cats_manage" ON public.cooperative_categories FOR ALL
  USING (public.has_coop_permission(cooperative_id, 'manage_products'))
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_products'));

-- Inventory Movements: Cooperative-only inserts; Super Admin retains read-only audit visibility.
DROP POLICY IF EXISTS "inventory_tenant_insert" ON public.inventory_movements;
CREATE POLICY "inventory_tenant_insert" ON public.inventory_movements FOR INSERT
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_inventory'));
