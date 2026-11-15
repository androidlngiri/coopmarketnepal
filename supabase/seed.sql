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
