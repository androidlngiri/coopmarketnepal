import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { t } from '../lib/i18n';
import { ProductCard, type ProductRecord } from '../components/ProductCard';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';

export function MarketplacePage() {
  const { lang } = useApp();
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string; name_ne: string; name_en: string }>>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [discounted, setDiscounted] = useState(false);
  const [sort, setSort] = useState('featured');
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (category) params.set('category', category);
    if (district.trim()) params.set('district', district.trim());
    if (discounted) params.set('discounted', '1');
    if (sort) params.set('sort', sort);

    const res = await apiFetch<{ products: ProductRecord[] }>(`/api/public/products?${params.toString()}`);
    if (res.ok) setProducts(res.data.products);
    setLoading(false);
  };

  useEffect(() => {
    apiFetch<{ categories: Array<{ id: string; slug: string; name_ne: string; name_en: string }> }>('/api/public/marketplace').then(
      (res) => {
        if (res.ok) setCategories(res.data.categories);
      }
    );
  }, []);

  useEffect(() => {
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, discounted, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="space-y-2 border-b border-[#E5E2DC] pb-5">
        <h1 className="font-display text-3xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'सहकारी उत्पादन बजार' : 'Cooperative Product Marketplace'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {lang === 'ne'
            ? 'नेपालभरका स्वीकृत सहकारी संस्थाहरूद्वारा उत्पादित र प्रमाणित वस्तुहरू खोज्नुहोस्।'
            : 'Search verified agricultural, dairy, and handicraft products across approved cooperatives.'}
        </p>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadProducts();
        }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 bg-white p-4 border border-[#E5E2DC] rounded-xl"
      >
        <div className="lg:col-span-2 relative">
          <Search className="w-4 h-4 text-[#78716C] absolute left-3 top-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder', lang)}
            className="pl-9"
          />
        </div>

        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t('allCategories', lang)}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {lang === 'ne' ? c.name_ne : c.name_en}
            </option>
          ))}
        </Select>

        <Input
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          placeholder={lang === 'ne' ? 'जिल्ला (जस्तै: इलाम, जुम्ला)' : 'District (e.g. Ilam, Jumla)'}
        />

        <Select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="featured">{lang === 'ne' ? 'विशेष क्रम' : 'Featured'}</option>
          <option value="newest">{lang === 'ne' ? 'नयाँ आगमन' : 'New Arrivals'}</option>
          <option value="price_asc">{lang === 'ne' ? 'कम मूल्य पहिले' : 'Price: Low to High'}</option>
          <option value="price_desc">{lang === 'ne' ? 'बढी मूल्य पहिले' : 'Price: High to Low'}</option>
        </Select>

        <div className="flex items-center gap-2">
          <Button type="submit" className="flex-1">
            {lang === 'ne' ? 'खोज्नुहोस्' : 'Filter'}
          </Button>
          <button
            type="button"
            onClick={() => setDiscounted((d) => !d)}
            className={`h-10 px-3 rounded-lg text-xs font-medium border whitespace-nowrap cursor-pointer ${
              discounted ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-[#57534E] border-[#E5E2DC]'
            }`}
          >
            {lang === 'ne' ? 'छुट मात्र' : 'Deals'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-80 rounded-xl bg-[#F3F1EC] animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center bg-white border border-[#E5E2DC] rounded-xl space-y-3">
          <p className="text-sm text-[#57534E]">
            {lang === 'ne' ? 'खोज अनुसार कुनै उत्पादन फेला परेन।' : 'No matching cooperative products found.'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setQ('');
              setCategory('');
              setDistrict('');
              setDiscounted(false);
              setSort('featured');
            }}
          >
            {lang === 'ne' ? 'फिल्टर रिसेट गर्नुहोस्' : 'Reset Filters'}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      )}
    </div>
  );
}
