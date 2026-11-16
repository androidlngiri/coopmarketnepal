-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0007:
-- System Data Cleanup, Soft-Archive Recovery, Verified Backups & Immutable Audit
-- ============================================================================

-- 1. Soft-delete / Archive columns on key tenant & catalog tables
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cooperatives_deleted_at
  ON public.cooperatives(deleted_at);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at
  ON public.products(deleted_at);

-- 2. Verified Pre-Cleanup Backup Snapshots Table
CREATE TABLE IF NOT EXISTS public.cleanup_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_label TEXT NOT NULL,
  category TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'manual_backup' CHECK (mode IN ('soft_archive', 'permanent_delete', 'manual_backup')),
  table_counts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_count INTEGER NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum_sha256 TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  restored_at TIMESTAMPTZ,
  restored_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  restore_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleanup_backups_created
  ON public.cleanup_backups(created_at DESC);

-- 3. Immutable Cleanup Audit History Table
CREATE TABLE IF NOT EXISTS public.cleanup_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('soft_archive', 'permanent_delete', 'restore_backup')),
  reason TEXT NOT NULL,
  filters_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  deleted_count INTEGER NOT NULL DEFAULT 0,
  retained_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  backup_id UUID REFERENCES public.cleanup_backups(id) ON DELETE RESTRICT,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('completed', 'partial', 'blocked', 'failed')),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cleanup_audit_logs_created
  ON public.cleanup_audit_logs(created_at DESC);

-- Prevent updates or deletes on cleanup_audit_logs to preserve administrative immutability
CREATE OR REPLACE FUNCTION public.prevent_cleanup_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'cleanup_audit_logs is immutable and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_audit_logs_immutable ON public.cleanup_audit_logs;
CREATE TRIGGER trg_cleanup_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.cleanup_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cleanup_audit_mutation();

-- 4. Strict Row Level Security (Super Admin read-only; mutations via server service role)
ALTER TABLE public.cleanup_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cleanup_backups_super_admin_read" ON public.cleanup_backups;
CREATE POLICY "cleanup_backups_super_admin_read" ON public.cleanup_backups FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "cleanup_audit_logs_super_admin_read" ON public.cleanup_audit_logs;
CREATE POLICY "cleanup_audit_logs_super_admin_read" ON public.cleanup_audit_logs FOR SELECT
  USING (public.is_super_admin());

-- 5. Keep admin overview metrics aligned with soft-deleted records
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
      ) FROM public.cooperatives WHERE deleted_at IS NULL
    ),
    'subCounts', (
      SELECT jsonb_build_object(
        'active_subs', COALESCE(SUM(CASE WHEN status IN ('trial', 'active') AND ends_at > NOW() THEN 1 ELSE 0 END), 0),
        'expired_subs', COALESCE(SUM(CASE WHEN status = 'expired' OR ends_at <= NOW() THEN 1 ELSE 0 END), 0)
      ) FROM public.subscriptions
    ),
    'marketplaceStats', jsonb_build_object(
      'total_products', (SELECT COUNT(*) FROM public.products WHERE status <> 'archived' AND deleted_at IS NULL),
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
