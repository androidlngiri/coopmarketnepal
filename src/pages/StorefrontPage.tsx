import { useEffect, useState } from 'react';
import { Bell, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatNPR } from '../lib/bs-date';
import { SafeImage } from '../components/SafeImage';
import { ProductCard, type ProductRecord } from '../components/ProductCard';
import { Button } from '../components/ui/button';

interface StorePayload {
  cooperative: {
    id: string;
    slug: string;
    name_ne: string;
    name_en: string;
    registration_number: string;
    registration_authority: string;
    registration_date_bs: string;
    province: string;
    district: string;
    municipality: string;
    ward_number: string;
    tole_address: string;
    contact_phone: string;
    contact_email: string;
    logo_url?: string | null;
  };
  store: {
    store_name_ne: string;
    store_name_en: string;
    tagline_ne: string;
    tagline_en: string;
    theme_key: string;
    primary_color: string;
    accent_color: string;
    font_key: string;
    logo_url: string;
    banner_url: string;
    intro_ne: string;
    intro_en: string;
    mission_ne: string;
    mission_en: string;
    vision_ne: string;
    vision_en: string;
    notice_ne: string;
    notice_en: string;
    footer_text_ne: string;
    footer_text_en: string;
    sections: Array<{ id: string; type: string; visible: boolean; title_ne: string; title_en: string }>;
  };
  coopCategories: Array<{ id: string; name_ne: string; name_en: string }>;
  deliveryConfig: {
    default_fee_npr: number;
    free_delivery_threshold_npr: number;
    minimum_order_npr: number;
    pickup_enabled: number;
    pickup_address_ne: string;
    delivery_areas: string[];
  } | null;
  products: ProductRecord[];
}

export function StorefrontPage({ slug }: { slug: string }) {
  const { lang, navigate } = useApp();
  const [data, setData] = useState<StorePayload | null>(null);
  const [error, setError] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const isPreview = window.location.search.includes('preview=1');

  useEffect(() => {
    setError('');
    apiFetch<StorePayload>(`/api/public/stores/${slug}${isPreview ? '?preview=1' : ''}`).then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.error || 'Store not found');
    });
  }, [slug, isPreview]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">{error}</h1>
        <Button onClick={() => navigate('/cooperatives')}>
          {lang === 'ne' ? 'सहकारी निर्देशिकामा फर्कनुहोस्' : 'Back to Cooperatives'}
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 space-y-6">
        <div className="h-64 rounded-xl bg-[#F3F1EC] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-72 rounded-xl bg-[#F3F1EC] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { cooperative, store, products, coopCategories, deliveryConfig } = data;
  const primaryColor = store.primary_color || '#B91C1C';
  const filteredProducts =
    selectedCat === 'all'
      ? products
      : products.filter((p: ProductRecord & { coop_category_id?: string }) => p.coop_category_id === selectedCat);

  const visibleSections =
    store.sections && store.sections.length > 0
      ? store.sections.filter((s) => s.visible)
      : [
          { id: 'hero', type: 'hero', visible: true, title_ne: '', title_en: '' },
          { id: 'notice', type: 'notice', visible: true, title_ne: '', title_en: '' },
          { id: 'featured_products', type: 'featured_products', visible: true, title_ne: 'उत्पादनहरू', title_en: 'Products' },
          { id: 'about', type: 'about', visible: true, title_ne: 'हाम्रो परिचय', title_en: 'About' },
        ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {isPreview && (
        <div className="p-3 rounded-lg bg-[#0F172A] text-white text-xs flex items-center justify-between">
          <span>{lang === 'ne' ? 'पसल मस्यौदा पूर्वावलोकन मोड (Draft Preview)' : 'Store Builder Draft Preview Mode'}</span>
          <button type="button" onClick={() => navigate('/cooperative')} className="underline cursor-pointer">
            {lang === 'ne' ? 'ड्यासबोर्डमा फर्कनुहोस्' : 'Return to Dashboard'}
          </button>
        </div>
      )}

      {visibleSections.map((sec) => {
        if (sec.type === 'hero') {
          return (
            <section
              key={sec.id}
              className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
            >
              <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-center space-y-4">
                <div className="flex items-center gap-3">
                  <SafeImage
                    src={store.logo_url || cooperative.logo_url}
                    alt={lang === 'ne' ? store.store_name_ne : store.store_name_en}
                    variant="store"
                    compact
                    lang={lang}
                    className="w-16 h-16 rounded-xl border border-[#E5E2DC] bg-white shrink-0"
                  />
                  <div>
                    <p className="text-xs text-[#57534E]">{lang === 'ne' ? cooperative.name_ne : cooperative.name_en}</p>
                    <p className="text-xs text-[#15803D] inline-flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {lang === 'ne' ? 'प्रमाणित सहकारी पसल' : 'Verified Cooperative Store'}
                    </p>
                  </div>
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#0F172A]">
                  {lang === 'ne' ? store.store_name_ne : store.store_name_en}
                </h1>
                <p className="text-base text-[#57534E]">{lang === 'ne' ? store.tagline_ne : store.tagline_en}</p>
                <div className="flex flex-wrap gap-4 text-xs text-[#57534E] pt-2">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {cooperative.municipality}-{cooperative.ward_number}, {cooperative.district}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Phone className="w-3.5 h-3.5" />
                    {cooperative.contact_phone}
                  </span>
                </div>
              </div>
              <div className="lg:col-span-6 min-h-[260px] bg-[#F3F1EC]">
                <SafeImage
                  src={store.banner_url}
                  alt={lang === 'ne' ? store.store_name_ne : store.store_name_en}
                  className="w-full h-full object-cover"
                />
              </div>
            </section>
          );
        }

        if (sec.type === 'notice' && (store.notice_ne || store.notice_en)) {
          return (
            <section
              key={sec.id}
              className="p-4 rounded-xl border border-[#E5E2DC] bg-white flex items-start gap-3"
            >
              <Bell className="w-5 h-5 shrink-0 mt-0.5" style={{ color: primaryColor }} />
              <div className="text-sm text-[#0F172A]">
                <span className="font-semibold mr-2">
                  {lang === 'ne' ? 'सूचना:' : 'Notice:'}
                </span>
                {lang === 'ne' ? store.notice_ne : store.notice_en}
              </div>
            </section>
          );
        }

        if (sec.type === 'featured_products') {
          return (
            <section key={sec.id} className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E2DC] pb-4">
                <h2 className="font-display text-2xl font-bold text-[#0F172A]">
                  {lang === 'ne' ? sec.title_ne || 'सहकारी उत्पादनहरू' : sec.title_en || 'Cooperative Products'}
                </h2>
                {coopCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setSelectedCat('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                        selectedCat === 'all' ? 'text-white' : 'bg-[#F3F1EC] text-[#57534E]'
                      }`}
                      style={selectedCat === 'all' ? { backgroundColor: primaryColor } : undefined}
                    >
                      {lang === 'ne' ? 'सबै' : 'All'}
                    </button>
                    {coopCategories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCat(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                          selectedCat === c.id ? 'text-white' : 'bg-[#F3F1EC] text-[#57534E]'
                        }`}
                        style={selectedCat === c.id ? { backgroundColor: primaryColor } : undefined}
                      >
                        {lang === 'ne' ? c.name_ne : c.name_en}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="p-12 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E]">
                  {lang === 'ne' ? 'यस पसलमा हाल प्रकाशित उत्पादन छैनन्।' : 'No published products yet.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={{
                        ...p,
                        cooperative_slug: cooperative.slug,
                        store_name_ne: store.store_name_ne,
                        store_name_en: store.store_name_en,
                        cooperative_district: cooperative.district,
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        }

        if (sec.type === 'about') {
          return (
            <section key={sec.id} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-2">
                <h3 className="font-semibold text-base text-[#0F172A]">
                  {lang === 'ne' ? 'सहकारी परिचय' : 'About Cooperative'}
                </h3>
                <p className="text-sm text-[#57534E] leading-relaxed">
                  {lang === 'ne' ? store.intro_ne : store.intro_en}
                </p>
                <p className="text-xs text-[#78716C] pt-2 font-mono">
                  Reg: {cooperative.registration_number} · {cooperative.registration_authority}
                </p>
              </div>
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-2">
                <h3 className="font-semibold text-base text-[#0F172A]">
                  {lang === 'ne' ? 'लक्ष्य र उद्देश्य (Mission & Vision)' : 'Mission & Vision'}
                </h3>
                <p className="text-sm text-[#57534E] leading-relaxed">
                  {lang === 'ne' ? store.mission_ne : store.mission_en}
                </p>
                <p className="text-sm text-[#57534E] leading-relaxed pt-1">
                  {lang === 'ne' ? store.vision_ne : store.vision_en}
                </p>
              </div>
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-2">
                <h3 className="font-semibold text-base text-[#0F172A]">
                  {lang === 'ne' ? 'डेलिभरी तथा पसल जानकारी' : 'Delivery & Store Info'}
                </h3>
                {deliveryConfig && (
                  <div className="text-sm text-[#57534E] space-y-1.5 tabular-nums">
                    <p>
                      {lang === 'ne' ? 'न्यूनतम अर्डर:' : 'Min Order:'}{' '}
                      <strong className="text-[#0F172A]">{formatNPR(deliveryConfig.minimum_order_npr, lang)}</strong>
                    </p>
                    <p>
                      {lang === 'ne' ? 'डेलिभरी शुल्क:' : 'Delivery Fee:'}{' '}
                      <strong className="text-[#0F172A]">{formatNPR(deliveryConfig.default_fee_npr, lang)}</strong>
                    </p>
                    <p>
                      {lang === 'ne' ? 'निःशुल्क डेलिभरी:' : 'Free Delivery Over:'}{' '}
                      <strong className="text-[#15803D]">
                        {formatNPR(deliveryConfig.free_delivery_threshold_npr, lang)}
                      </strong>
                    </p>
                    {deliveryConfig.delivery_areas.length > 0 && (
                      <p className="text-xs text-[#78716C] pt-1">
                        {lang === 'ne' ? 'सेवा क्षेत्र:' : 'Areas:'} {deliveryConfig.delivery_areas.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
