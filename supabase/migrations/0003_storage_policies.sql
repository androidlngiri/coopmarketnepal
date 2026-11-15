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
