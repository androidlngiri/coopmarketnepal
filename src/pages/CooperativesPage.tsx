import { useEffect, useState } from 'react';
import { ArrowRight, MapPin, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { NEPAL_PROVINCES, toNepaliDigits } from '../lib/bs-date';
import { COOP_TYPES, labelFor, t } from '../lib/i18n';
import { SafeImage } from '../components/SafeImage';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';

interface DirectoryCoop {
  id: string;
  slug: string;
  name_ne: string;
  name_en: string;
  cooperative_type: string;
  province: string;
  district: string;
  municipality: string;
  registration_number: string;
  store_name_ne: string;
  store_name_en: string;
  tagline_ne: string;
  tagline_en: string;
  banner_url: string;
  logo_url: string;
  product_count: number;
}

export function CooperativesPage() {
  const { lang, navigate } = useApp();
  const [coops, setCoops] = useState<DirectoryCoop[]>([]);
  const [q, setQ] = useState('');
  const [province, setProvince] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchDirectory = async (overrides?: { q?: string; province?: string; type?: string }) => {
    setLoading(true);
    const nextQ = overrides?.q !== undefined ? overrides.q : q;
    const nextProv = overrides?.province !== undefined ? overrides.province : province;
    const nextType = overrides?.type !== undefined ? overrides.type : type;

    const params = new URLSearchParams();
    if (nextQ.trim()) params.set('q', nextQ.trim());
    if (nextProv) params.set('province', nextProv);
    if (nextType) params.set('type', nextType);
    const res = await apiFetch<{ cooperatives: DirectoryCoop[] }>(`/api/public/cooperatives?${params.toString()}`);
    if (res.ok) setCoops(res.data.cooperatives);
    setLoading(false);
  };

  useEffect(() => {
    fetchDirectory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [province, type]);

  const handleReset = () => {
    setQ('');
    setProvince('');
    setType('');
    fetchDirectory({ q: '', province: '', type: '' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5E2DC] pb-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#0F172A]">
            {lang === 'ne' ? 'राष्ट्रिय सहकारी निर्देशिका' : 'National Cooperative Directory'}
          </h1>
          <p className="text-sm text-[#57534E] mt-1">
            {lang === 'ne'
              ? 'दर्ता र कागजात प्रमाणित भई सञ्चालनमा रहेका सहकारी पसलहरू।'
              : 'Browse government-registered and admin-verified cooperatives operating independent storefronts.'}
          </p>
        </div>
        <Button onClick={() => navigate('/register-cooperative')}>{t('openCoopStore', lang)}</Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          fetchDirectory();
        }}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 border border-[#E5E2DC] rounded-xl"
      >
        <div className="relative">
          <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === 'ne' ? 'सहकारी वा जिल्ला...' : 'Cooperative or district...'}
            className="pl-9"
          />
        </div>
        <Select value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">{lang === 'ne' ? 'सबै प्रदेश' : 'All Provinces'}</option>
          {Object.entries(NEPAL_PROVINCES).map(([key, p]) => (
            <option key={key} value={key}>
              {lang === 'ne' ? p.ne : p.en}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{lang === 'ne' ? 'सबै सहकारी प्रकार' : 'All Cooperative Types'}</option>
          {Object.entries(COOP_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {lang === 'ne' ? v.ne : v.en}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? t('loading', lang) : lang === 'ne' ? 'खोज्नुहोस्' : 'Search'}
          </Button>
          {(q || province || type) && (
            <Button type="button" variant="outline" onClick={handleReset}>
              {lang === 'ne' ? 'रिसेट' : 'Reset'}
            </Button>
          )}
        </div>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-72 rounded-xl bg-[#F3F1EC] animate-pulse" />
          ))}
        </div>
      ) : coops.length === 0 ? (
        <div className="py-14 text-center bg-white border border-[#E5E2DC] rounded-xl space-y-3">
          <p className="text-sm text-[#57534E]">
            {lang === 'ne' ? 'कुनै सहकारी फेला परेन।' : 'No cooperatives matched your search.'}
          </p>
          <Button variant="outline" onClick={handleReset}>
            {lang === 'ne' ? 'फिल्टर रिसेट गर्नुहोस्' : 'Reset Filters'}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {coops.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/store/${c.slug}`)}
              className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
            >
              <div>
                <div className="aspect-[16/9] bg-[#F3F1EC] relative">
                  <SafeImage
                    src={c.banner_url || c.logo_url}
                    alt={lang === 'ne' ? c.store_name_ne : c.store_name_en}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute -bottom-6 left-5 w-14 h-14 rounded-xl border-2 border-white bg-white shadow-sm overflow-hidden">
                    <SafeImage
                      src={c.logo_url}
                      alt={lang === 'ne' ? c.store_name_ne : c.store_name_en}
                      variant="store"
                      compact
                      lang={lang}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="p-5 pt-8 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#78716C]">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>
                      {c.municipality}, {c.district} · {labelFor(COOP_TYPES, c.cooperative_type, lang)}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#0F172A]">
                    {lang === 'ne' ? c.store_name_ne : c.store_name_en}
                  </h2>
                  <p className="text-xs text-[#57534E]">{lang === 'ne' ? c.name_ne : c.name_en}</p>
                  <p className="text-sm text-[#57534E] line-clamp-2 pt-1">
                    {lang === 'ne' ? c.tagline_ne : c.tagline_en}
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-[#F3F1EC] flex items-center justify-between text-xs">
                <span className="text-[#78716C] font-mono">Reg: {c.registration_number}</span>
                <span className="font-semibold text-[#B91C1C] inline-flex items-center gap-1">
                  {t('viewStore', lang)} ({lang === 'ne' ? toNepaliDigits(c.product_count) : c.product_count}){' '}
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
