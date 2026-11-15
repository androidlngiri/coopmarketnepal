-- ============================================================================
-- Sahakari Bazar (सहकारी बजार) — Migration 0006:
-- Rich Product Details, SEO Fields, AI Product Assistant & Daily Quota (Asia/Kathmandu)
-- ============================================================================

-- 1. Expand products availability constraint & add structured detail/SEO columns
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_availability_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_availability_status_check
  CHECK (availability_status IN ('in_stock', 'out_of_stock', 'preorder', 'discontinued'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_description_ne TEXT,
  ADD COLUMN IF NOT EXISTS short_description_en TEXT,
  ADD COLUMN IF NOT EXISTS ai_details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seo_title_ne TEXT,
  ADD COLUMN IF NOT EXISTS seo_title_en TEXT,
  ADD COLUMN IF NOT EXISTS seo_meta_description_ne TEXT,
  ADD COLUMN IF NOT EXISTS seo_meta_description_en TEXT,
  ADD COLUMN IF NOT EXISTS seo_keywords_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_assisted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. AI Product Generations & Daily Quota Ledger
CREATE TABLE IF NOT EXISTS public.ai_product_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'create' CHECK (mode IN ('create', 'edit')),
  product_name_input TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ne' CHECK (language IN ('ne', 'en')),
  generation_date_ktm DATE NOT NULL DEFAULT (TIMEZONE('Asia/Kathmandu', NOW())::DATE),
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'failed', 'cancelled')),
  counts_toward_quota BOOLEAN NOT NULL DEFAULT TRUE,
  generated_payload_json JSONB,
  error_message TEXT,
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_gen_coop_date
  ON public.ai_product_generations(cooperative_id, generation_date_ktm, counts_toward_quota, status);
CREATE INDEX IF NOT EXISTS idx_ai_gen_created
  ON public.ai_product_generations(created_at DESC);

-- 3. Strict Multi-Tenant Row Level Security on AI Generations
ALTER TABLE public.ai_product_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_gen_tenant_read" ON public.ai_product_generations;
CREATE POLICY "ai_gen_tenant_read" ON public.ai_product_generations FOR SELECT
  USING (public.is_coop_member(cooperative_id) OR public.is_super_admin());

DROP POLICY IF EXISTS "ai_gen_tenant_insert" ON public.ai_product_generations;
CREATE POLICY "ai_gen_tenant_insert" ON public.ai_product_generations FOR INSERT
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_products'));

DROP POLICY IF EXISTS "ai_gen_tenant_update" ON public.ai_product_generations;
CREATE POLICY "ai_gen_tenant_update" ON public.ai_product_generations FOR UPDATE
  USING (public.has_coop_permission(cooperative_id, 'manage_products'))
  WITH CHECK (public.has_coop_permission(cooperative_id, 'manage_products'));

-- 4. Atomic Quota Reservation RPC (prevents concurrent/duplicate bypasses)
CREATE OR REPLACE FUNCTION public.reserve_coop_ai_generation(
  p_cooperative_id UUID,
  p_user_id UUID,
  p_product_id UUID,
  p_mode TEXT,
  p_product_name TEXT,
  p_language TEXT,
  p_model TEXT,
  p_daily_limit INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_ktm DATE := TIMEZONE('Asia/Kathmandu', NOW())::DATE;
  v_coop_exists UUID;
  v_used INTEGER;
  v_gen_id UUID;
BEGIN
  -- Serialize requests per cooperative without locking unrelated cooperatives
  SELECT id INTO v_coop_exists
  FROM public.cooperatives
  WHERE id = p_cooperative_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'सहकारी फेला परेन।';
  END IF;

  -- Expire abandoned in-flight reservations older than 2 minutes
  UPDATE public.ai_product_generations
  SET status = 'failed',
      counts_toward_quota = FALSE,
      error_message = 'Generation reservation expired',
      completed_at = NOW()
  WHERE cooperative_id = p_cooperative_id
    AND status = 'reserved'
    AND created_at < NOW() - INTERVAL '2 minutes';

  SELECT COUNT(*)::INT INTO v_used
  FROM public.ai_product_generations
  WHERE cooperative_id = p_cooperative_id
    AND generation_date_ktm = v_today_ktm
    AND counts_toward_quota = TRUE
    AND status IN ('reserved', 'completed');

  IF v_used >= p_daily_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'used', v_used,
      'limit', p_daily_limit,
      'remaining', 0,
      'dateKtm', v_today_ktm::TEXT
    );
  END IF;

  INSERT INTO public.ai_product_generations (
    cooperative_id, user_id, product_id, mode, product_name_input,
    language, generation_date_ktm, model, status, counts_toward_quota
  ) VALUES (
    p_cooperative_id,
    p_user_id,
    p_product_id,
    CASE WHEN p_mode = 'edit' THEN 'edit' ELSE 'create' END,
    LEFT(BTRIM(COALESCE(p_product_name, '')), 200),
    CASE WHEN p_language = 'en' THEN 'en' ELSE 'ne' END,
    v_today_ktm,
    p_model,
    'reserved',
    TRUE
  )
  RETURNING id INTO v_gen_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'generationId', v_gen_id,
    'used', v_used + 1,
    'limit', p_daily_limit,
    'remaining', GREATEST(0, p_daily_limit - (v_used + 1)),
    'dateKtm', v_today_ktm::TEXT
  );
END;
$$;

-- 5. Complete or Release AI Generation Reservation
CREATE OR REPLACE FUNCTION public.complete_coop_ai_generation(
  p_generation_id UUID,
  p_status TEXT,
  p_payload JSONB,
  p_error_message TEXT,
  p_prompt_tokens INTEGER DEFAULT NULL,
  p_output_tokens INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_today_ktm DATE := TIMEZONE('Asia/Kathmandu', NOW())::DATE;
  v_used INTEGER;
BEGIN
  UPDATE public.ai_product_generations
  SET status = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'failed' END,
      counts_toward_quota = CASE WHEN p_status = 'completed' THEN TRUE ELSE FALSE END,
      generated_payload_json = p_payload,
      error_message = NULLIF(p_error_message, ''),
      prompt_tokens = p_prompt_tokens,
      output_tokens = p_output_tokens,
      completed_at = NOW()
  WHERE id = p_generation_id
  RETURNING cooperative_id, generation_date_ktm INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE);
  END IF;

  SELECT COUNT(*)::INT INTO v_used
  FROM public.ai_product_generations
  WHERE cooperative_id = v_row.cooperative_id
    AND generation_date_ktm = v_today_ktm
    AND counts_toward_quota = TRUE
    AND status IN ('reserved', 'completed');

  RETURN jsonb_build_object(
    'ok', TRUE,
    'used', v_used,
    'limit', 2,
    'remaining', GREATEST(0, 2 - v_used),
    'dateKtm', v_today_ktm::TEXT
  );
END;
$$;

-- 6. Read Current Cooperative Daily Quota (Asia/Kathmandu)
CREATE OR REPLACE FUNCTION public.get_coop_ai_quota(
  p_cooperative_id UUID,
  p_daily_limit INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_ktm DATE := TIMEZONE('Asia/Kathmandu', NOW())::DATE;
  v_used INTEGER;
BEGIN
  UPDATE public.ai_product_generations
  SET status = 'failed',
      counts_toward_quota = FALSE,
      error_message = 'Generation reservation expired',
      completed_at = NOW()
  WHERE cooperative_id = p_cooperative_id
    AND status = 'reserved'
    AND created_at < NOW() - INTERVAL '2 minutes';

  SELECT COUNT(*)::INT INTO v_used
  FROM public.ai_product_generations
  WHERE cooperative_id = p_cooperative_id
    AND generation_date_ktm = v_today_ktm
    AND counts_toward_quota = TRUE
    AND status IN ('reserved', 'completed');

  RETURN jsonb_build_object(
    'used', v_used,
    'limit', p_daily_limit,
    'remaining', GREATEST(0, p_daily_limit - v_used),
    'dateKtm', v_today_ktm::TEXT
  );
END;
$$;

-- 7. Super Admin Read-Only Platform AI Usage Telemetry
CREATE OR REPLACE FUNCTION public.get_platform_ai_usage_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tz_now AS (
    SELECT TIMEZONE('Asia/Kathmandu', NOW())::DATE AS today_ktm
  )
  SELECT jsonb_build_object(
    'today_ktm', (SELECT today_ktm::TEXT FROM tz_now),
    'total_completed', (SELECT COUNT(*)::INT FROM public.ai_product_generations WHERE status = 'completed'),
    'today_completed', (SELECT COUNT(*)::INT FROM public.ai_product_generations WHERE status = 'completed' AND generation_date_ktm = (SELECT today_ktm FROM tz_now)),
    'total_failed', (SELECT COUNT(*)::INT FROM public.ai_product_generations WHERE status = 'failed'),
    'active_coops_today', (SELECT COUNT(DISTINCT cooperative_id)::INT FROM public.ai_product_generations WHERE counts_toward_quota = TRUE AND status IN ('reserved', 'completed') AND generation_date_ktm = (SELECT today_ktm FROM tz_now)),
    'by_cooperative', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cooperative_id', r.cooperative_id,
        'cooperative_name_ne', r.name_ne,
        'cooperative_name_en', r.name_en,
        'today_used', r.today_used,
        'total_completed', r.total_completed,
        'last_generated_at', r.last_generated_at
      ) ORDER BY r.today_used DESC, r.total_completed DESC)
      FROM (
        SELECT c.id AS cooperative_id,
               c.name_ne,
               c.name_en,
               COUNT(*) FILTER (WHERE g.generation_date_ktm = (SELECT today_ktm FROM tz_now) AND g.counts_toward_quota = TRUE AND g.status IN ('reserved', 'completed'))::INT AS today_used,
               COUNT(*) FILTER (WHERE g.status = 'completed')::INT AS total_completed,
               MAX(g.created_at) AS last_generated_at
        FROM public.ai_product_generations g
        JOIN public.cooperatives c ON c.id = g.cooperative_id
        GROUP BY c.id, c.name_ne, c.name_en
      ) r
    ), '[]'::jsonb)
  );
$$;
