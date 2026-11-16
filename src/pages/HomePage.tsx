import { useEffect, useState } from 'react';
import { ArrowRight, MapPin, ShieldCheck, Store } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatNPR, toNepaliDigits } from '../lib/bs-date';
import { t } from '../lib/i18n';
import { SafeImage } from '../components/SafeImage';
import { ProductCard, type ProductRecord } from '../components/ProductCard';
import { Button } from '../components/ui/button';

interface MarketplacePayload {
  categories: Array<{ id: string; slug: string; name_ne: string; name_en: string }>;
  featuredCooperatives: Array<{
    id: string;
    slug: string;
    name_ne: string;
    name_en: string;
    province: string;
    district: string;
    store_name_ne: string;
    store_name_en: string;
    tagline_ne: string;
    tagline_en: string;
    banner_url: string;
    logo_url: string;
    product_count: number;
  }>;
  featuredProducts: ProductRecord[];
  plans: Array<{
    id: string;
    code: string;
    name_ne: string;
    name_en: string;
    description_ne: string;
    description_en: string;
    monthly_price_npr: number;
    annual_price_npr: number;
    max_products: number;
    max_staff: number;
    trial_days: number;
  }>;
  branding: {
    announcement_ne?: string;
    announcement_en?: string;
  };
  stats: {
    approved_cooperatives: number;
    published_products: number;
    covered_districts: number;
  };
}

export function HomePage() {
  const { lang, navigate, user } = useApp();
  const isCoopUser = Boolean(user && (user.role === 'cooperative_admin' || user.role === 'cooperative_staff'));
  const isSuperAdmin = user?.role === 'super_admin';
  const coopCtaPath = isSuperAdmin ? '/super-admin' : isCoopUser ? '/cooperative' : '/register-cooperative';
  const coopCtaLabel = isSuperAdmin
    ? lang === 'ne'
      ? 'सुपर एडमिन प्यानल'
      : 'Super Admin Panel'
    : isCoopUser
    ? lang === 'ne'
      ? 'मेरो सहकारी ड्यासबोर्ड'
      : 'My Cooperative Dashboard'
    : t('openCoopStore', lang);
  const [data, setData] = useState<MarketplacePayload | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<MarketplacePayload>('/api/public/marketplace').then((res) => {
      if (res.ok) setData(res.data);
      setLoading(false);
    });
  }, []);

  const filteredProducts =
    data?.featuredProducts.filter((p) => selectedCategory === 'all' || p.category_slug === selectedCategory) || [];

  return (
    <div className="space-y-16">
      {/* Slim Announcement Strip */}
      {(data?.branding?.announcement_ne || data?.branding?.announcement_en) && (
        <div className="bg-[#0F172A] text-white text-xs py-2 px-4 text-center">
          {lang === 'ne' ? data.branding.announcement_ne : data.branding.announcement_en}
        </div>
      )}

      {/* Section 1: Split Editorial Hero + 4-Column Proof Strip */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-4">
            <p className="text-xs font-medium text-[#B91C1C] tracking-wide">
              {lang === 'ne'
                ? 'नेपालको आधिकारिक बहु-सहकारी डिजिटल बजार'
                : 'Official Multi-Tenant Cooperative Marketplace of Nepal'}
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-[#0F172A] leading-[1.18]">
              {t('heroTitle', lang)}
            </h1>
            <p className="text-base text-[#57534E] leading-relaxed max-w-xl">{t('heroSubtitle', lang)}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button size="lg" onClick={() => navigate('/marketplace')}>
                {t('exploreMarketplace', lang)}
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate(coopCtaPath)}>
                {coopCtaLabel}
              </Button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[280px] sm:min-h-[380px] rounded-xl overflow-hidden border border-[#E5E2DC] bg-[#F3F1EC]">
              <SafeImage
                src="/images/hero-nepal-cooperative.jpg"
                alt={t('heroTitle', lang)}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Quantitative Proof Row */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 border border-[#E5E2DC] rounded-xl bg-white divide-y lg:divide-y-0 lg:divide-x divide-[#E5E2DC]">
          <div className="p-5">
            <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'स्वीकृत सहकारी पसल' : 'Verified Cooperatives'}</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">
              {loading
                ? '—'
                : lang === 'ne'
                ? toNepaliDigits(data?.stats.approved_cooperatives ?? 0)
                : data?.stats.approved_cooperatives ?? 0}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'उपलब्ध उत्पादन' : 'Published Products'}</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">
              {loading
                ? '—'
                : lang === 'ne'
                ? toNepaliDigits(data?.stats.published_products ?? 0)
                : data?.stats.published_products ?? 0}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'सक्रिय जिल्ला' : 'Districts Covered'}</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A] tabular-nums">
              {loading
                ? '—'
                : lang === 'ne'
                ? toNepaliDigits(data?.stats.covered_districts ?? 0)
                : data?.stats.covered_districts ?? 0}
            </p>
          </div>
          <div className="p-5">
            <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'अतिथि चेकआउट' : 'Checkout Mode'}</p>
            <p className="mt-1 text-base font-semibold text-[#15803D]">
              {lang === 'ne' ? 'दर्ता बिना खरिद सुविधा' : 'Guest & Multi-Coop Cart'}
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Featured Products with Interactive Category Segmented Filter */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5E2DC] pb-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">
              {t('featuredProducts', lang)}
            </h2>
            <p className="text-sm text-[#57534E] mt-1">
              {lang === 'ne'
                ? 'विभिन्न सहकारी पसलका ताजा र मौलिक उत्पादन एउटै कार्टमा जोड्नुहोस्।'
                : 'Combine items from multiple cooperative storefronts in a single cart.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-[#F3F1EC] text-[#57534E] hover:text-[#0F172A]'
              }`}
            >
              {t('allCategories', lang)}
            </button>
            {data?.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.slug)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  selectedCategory === cat.slug
                    ? 'bg-[#0F172A] text-white'
                    : 'bg-[#F3F1EC] text-[#57534E] hover:text-[#0F172A]'
                }`}
              >
                {lang === 'ne' ? cat.name_ne : cat.name_en}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-80 rounded-xl bg-[#F3F1EC] animate-pulse" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-12 text-center border border-[#E5E2DC] rounded-xl bg-white text-sm text-[#57534E]">
            {lang === 'ne' ? 'यस वर्गमा हाल उत्पादन उपलब्ध छैन।' : 'No products found in this category.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredProducts.slice(0, 8).map((prod) => (
              <ProductCard key={prod.id} product={prod} />
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => navigate('/marketplace')}>
            {lang === 'ne' ? 'सबै उत्पादन हेर्नुहोस्' : 'View Full Catalog'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Section 3: Verified Cooperative Storefronts + Craftsmanship Banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex items-end justify-between gap-4 border-b border-[#E5E2DC] pb-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">
              {t('featuredCooperatives', lang)}
            </h2>
            <p className="text-sm text-[#57534E] mt-1">
              {lang === 'ne'
                ? 'प्रत्येक स्वीकृत सहकारी संस्थाको आफ्नै स्वतन्त्र पसल, मूल्य र डेलिभरी व्यवस्थापन छ।'
                : 'Every verified cooperative operates an independent storefront with direct fulfillment.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/cooperatives')}>
            {lang === 'ne' ? 'सबै सहकारी' : 'All Cooperatives'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {data?.featuredCooperatives.map((coop) => (
            <div
              key={coop.id}
              onClick={() => navigate(`/store/${coop.slug}`)}
              className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
            >
              <div>
                <div className="aspect-[16/10] bg-[#F3F1EC] relative">
                  <SafeImage
                    src={coop.banner_url || coop.logo_url}
                    alt={lang === 'ne' ? coop.store_name_ne : coop.store_name_en}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute -bottom-5 left-4 w-12 h-12 rounded-xl border-2 border-white bg-white shadow-sm overflow-hidden">
                    <SafeImage
                      src={coop.logo_url}
                      alt={lang === 'ne' ? coop.store_name_ne : coop.store_name_en}
                      variant="store"
                      compact
                      lang={lang}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="p-4 pt-7 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {coop.district} · {coop.province}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-[#0F172A] leading-snug">
                    {lang === 'ne' ? coop.store_name_ne : coop.store_name_en}
                  </h3>
                  <p className="text-xs text-[#57534E] line-clamp-2">
                    {lang === 'ne' ? coop.tagline_ne : coop.tagline_en}
                  </p>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-[#F3F1EC] flex items-center justify-between text-xs">
                <span className="text-[#57534E] tabular-nums">
                  {lang === 'ne'
                    ? `${toNepaliDigits(coop.product_count)} उत्पादन`
                    : `${coop.product_count} products`}
                </span>
                <span className="font-medium text-[#B91C1C] inline-flex items-center gap-1">
                  {t('viewStore', lang)} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Cooperative Craftsmanship Story */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
          <div className="lg:col-span-6 min-h-[260px]">
            <SafeImage
              src="/images/banner-cooperative-artisan.jpg"
              alt={lang === 'ne' ? 'नेपाली सहकारी कृषक र उद्यमी' : 'Nepali Cooperative Artisans'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-center space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[#15803D]">
              <ShieldCheck className="w-4 h-4" />
              <span>
                {lang === 'ne'
                  ? 'दर्ता र कागजात प्रमाणित सहकारी मात्र'
                  : 'Strictly Verified & Registered Cooperatives Only'}
              </span>
            </div>
            <h3 className="font-display text-2xl font-bold text-[#0F172A]">
              {lang === 'ne'
                ? 'तपाईंको सहकारी संस्थाको आफ्नै डिजिटल पसल आजै सुरु गर्नुहोस्'
                : 'Launch an Independent Digital Storefront for Your Cooperative'}
            </h3>
            <p className="text-sm text-[#57534E] leading-relaxed">
              {lang === 'ne'
                ? 'दर्ता प्रमाणपत्र र मोबाइल OTP प्रमाणीकरण पश्चात् ३० दिनको निःशुल्क परीक्षण योजनामा भिजुअल स्टोर बिल्डर, इन्भेन्टरी र अनलाइन अर्डर प्रणाली प्राप्त गर्नुहोस्।'
                : 'Complete cooperative verification via Akash SMS OTP and access our visual store builder, inventory tracking, staff roles, and multi-cooperative checkout.'}
            </p>
            <div className="pt-2">
              <Button onClick={() => navigate(coopCtaPath)}>
                <Store className="w-4 h-4" />
                {isCoopUser
                  ? lang === 'ne'
                    ? 'मेरो पसल व्यवस्थापन गर्नुहोस्'
                    : 'Manage My Storefront'
                  : coopCtaLabel}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Configurable SaaS Subscription Plans */}
      {data?.plans && data.plans.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="border-b border-[#E5E2DC] pb-4">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">
              {lang === 'ne' ? 'सहकारी सदस्यता योजनाहरू' : 'Cooperative SaaS Subscription Plans'}
            </h2>
            <p className="text-sm text-[#57534E] mt-1">
              {lang === 'ne'
                ? 'प्रत्येक सहकारीको आकार र आवश्यकता अनुसार लचिलो मासिक तथा वार्षिक योजना।'
                : 'Flexible monthly and annual tiers configurable by platform administration.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {data.plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-[#0F172A]">
                    {lang === 'ne' ? plan.name_ne : plan.name_en}
                  </h3>
                  <p className="text-xs text-[#57534E] min-h-[34px]">
                    {lang === 'ne' ? plan.description_ne : plan.description_en}
                  </p>
                  <div className="pt-2 tabular-nums">
                    <span className="text-xl font-bold text-[#0F172A]">
                      {plan.monthly_price_npr === 0
                        ? lang === 'ne'
                          ? 'निःशुल्क'
                          : 'Free'
                        : formatNPR(plan.monthly_price_npr, lang)}
                    </span>
                    {plan.monthly_price_npr > 0 && (
                      <span className="text-xs text-[#78716C]">/{lang === 'ne' ? 'महिना' : 'mo'}</span>
                    )}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#F3F1EC] text-xs text-[#57534E] tabular-nums">
                  <div className="flex justify-between">
                    <span>{lang === 'ne' ? 'अधिकतम उत्पादन' : 'Max Products'}</span>
                    <span className="font-semibold text-[#0F172A]">
                      {lang === 'ne' ? toNepaliDigits(plan.max_products) : plan.max_products}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{lang === 'ne' ? 'कर्मचारी खाता' : 'Staff Seats'}</span>
                    <span className="font-semibold text-[#0F172A]">
                      {lang === 'ne' ? toNepaliDigits(plan.max_staff) : plan.max_staff}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => navigate(coopCtaPath)}
                  >
                    {isCoopUser
                      ? lang === 'ne'
                        ? 'ड्यासबोर्ड / सदस्यता'
                        : 'Manage Plan'
                      : isSuperAdmin
                      ? lang === 'ne'
                        ? 'एडमिन प्यानल'
                        : 'Manage Plans'
                      : lang === 'ne'
                      ? 'सहकारी दर्ता'
                      : 'Get Started'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
