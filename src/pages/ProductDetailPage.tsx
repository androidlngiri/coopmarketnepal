import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  Heart,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ShieldAlert,
  ShoppingBag,
  Store,
  Truck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatNPR, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS, t } from '../lib/i18n';
import { SafeImage } from '../components/SafeImage';
import { ProductCard, type ProductAiDetails, type ProductRecord } from '../components/ProductCard';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

interface ProductDetailResponse {
  product: ProductRecord & {
    sku: string;
    description_ne: string;
    description_en: string;
    origin_district: string;
    producer_name: string;
    cooperative_name_ne: string;
    cooperative_name_en: string;
    cooperative_province: string;
    registration_number: string;
  };
  images: Array<{ id: string; image_url: string; alt_text: string }>;
  deliveryConfig: {
    default_fee_npr: number;
    free_delivery_threshold_npr: number;
    pickup_enabled: number;
    delivery_instructions_ne: string;
    delivery_areas: string[];
  } | null;
  related: ProductRecord[];
}

export function ProductDetailPage({ slug }: { slug: string }) {
  const { lang, navigate, addToCart, user } = useApp();
  const [data, setData] = useState<ProductDetailResponse | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const [savedInWishlist, setSavedInWishlist] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  useEffect(() => {
    setError('');
    setQty(1);
    setData(null);
    apiFetch<ProductDetailResponse>(`/api/public/products/${slug}`).then((res) => {
      if (res.ok) {
        setData(res.data);
        setActiveImage(res.data.images[0]?.image_url || '');
      } else {
        setError(res.error || 'उत्पादन फेला परेन।');
      }
    });
  }, [slug]);

  useEffect(() => {
    if (!user || !data?.product?.id) {
      setSavedInWishlist(false);
      return;
    }
    apiFetch<{ items: Array<{ id: string }> }>('/api/buyer/wishlist').then((res) => {
      if (res.ok) {
        setSavedInWishlist(res.data.items.some((item) => item.id === data.product.id));
      }
    });
  }, [user, data?.product?.id]);

  useEffect(() => {
    if (!data?.product) return;
    const p = data.product;
    const seoTitle =
      (lang === 'ne' ? p.seo_title_ne : p.seo_title_en) ||
      `${lang === 'ne' ? p.name_ne : p.name_en} | सहकारी बजार`;
    const seoDesc =
      (lang === 'ne' ? p.seo_meta_description_ne : p.seo_meta_description_en) ||
      (lang === 'ne' ? p.short_description_ne || p.description_ne : p.short_description_en || p.description_en) ||
      '';
    document.title = seoTitle;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && seoDesc) metaDesc.setAttribute('content', seoDesc.slice(0, 160));
  }, [data, lang]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-lg font-semibold text-[#0F172A]">{error}</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => window.history.back()}>
            {lang === 'ne' ? 'पछाडि फर्कनुहोस्' : 'Go Back'}
          </Button>
          <Button onClick={() => navigate('/marketplace')}>
            {lang === 'ne' ? 'बजारमा जानुहोस्' : 'Browse Marketplace'}
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="max-w-7xl mx-auto px-4 py-12 h-96 bg-[#F3F1EC] rounded-xl animate-pulse" />;
  }

  const { product, images, deliveryConfig, related } = data;
  const effectivePrice =
    product.discount_price_npr && product.discount_price_npr > 0 ? product.discount_price_npr : product.price_npr;
  const hasDiscount = Boolean(product.discount_price_npr && product.discount_price_npr < product.price_npr);
  const title = lang === 'ne' ? product.name_ne : product.name_en;
  const shortDesc = lang === 'ne' ? product.short_description_ne : product.short_description_en;
  const fullDesc = lang === 'ne' ? product.description_ne : product.description_en;
  const avail = product.availability_status || 'in_stock';
  const canBuy = avail !== 'out_of_stock' && avail !== 'discontinued' && product.stock_quantity > 0;
  const details: ProductAiDetails = (product.ai_details_json || {}) as ProductAiDetails;

  const hasRichDetails =
    (details.highlights && details.highlights.length > 0) ||
    (details.known_specifications && details.known_specifications.length > 0) ||
    (details.ingredients_or_materials && details.ingredients_or_materials.length > 0) ||
    (details.uses_and_benefits && details.uses_and_benefits.length > 0) ||
    Boolean(details.preparation_or_usage) ||
    (details.recipe_suggestions && details.recipe_suggestions.length > 0) ||
    Boolean(details.storage_instructions) ||
    Boolean(details.handling_instructions) ||
    Boolean(details.safety_precautions) ||
    Boolean(details.packaging_suggestions);

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/marketplace');
    }
  };

  const handleAddToCart = () => {
    if (!canBuy) return;
    addToCart(
      {
        productId: product.id,
        slug: product.slug,
        cooperativeId: product.cooperative_id,
        cooperativeSlug: product.cooperative_slug,
        storeNameNe: product.store_name_ne,
        storeNameEn: product.store_name_en,
        nameNe: product.name_ne,
        nameEn: product.name_en,
        priceNpr: product.price_npr,
        discountPriceNpr: product.discount_price_npr,
        unitLabelNe: product.unit_label_ne,
        unitLabelEn: product.unit_label_en,
        imageUrl: activeImage,
        stockQuantity: product.stock_quantity,
      },
      qty
    );
    toast.success(lang === 'ne' ? 'कार्टमा थपियो' : 'Added to cart');
  };

  const handleWishlist = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    setWishlistBusy(true);
    const res = await apiFetch<{ saved: boolean }>('/api/buyer/wishlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id }),
    });
    setWishlistBusy(false);
    if (!res.ok) {
      toast.error(res.error || 'इच्छा सूची अद्यावधिक गर्न सकिएन।');
      return;
    }
    setSavedInWishlist(res.data.saved);
    toast.success(
      res.data.saved
        ? lang === 'ne'
          ? 'इच्छा सूचीमा सुरक्षित गरियो'
          : 'Saved to wishlist'
        : lang === 'ne'
        ? 'इच्छा सूचीबाट हटाइयो'
        : 'Removed from wishlist'
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {/* Back + Breadcrumbs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm text-[#57534E] hover:text-[#0F172A] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{lang === 'ne' ? 'पछाडि फर्कनुहोस्' : 'Back'}</span>
        </button>

        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-[#78716C]">
          <button type="button" onClick={() => navigate('/')} className="hover:text-[#0F172A] cursor-pointer">
            {lang === 'ne' ? 'गृहपृष्ठ' : 'Home'}
          </button>
          <span>/</span>
          <button type="button" onClick={() => navigate('/marketplace')} className="hover:text-[#0F172A] cursor-pointer">
            {t('navMarketplace', lang)}
          </button>
          <span>/</span>
          <button
            type="button"
            onClick={() => navigate(`/store/${product.cooperative_slug}`)}
            className="hover:text-[#B91C1C] cursor-pointer truncate max-w-[160px]"
          >
            {lang === 'ne' ? product.store_name_ne : product.store_name_en}
          </button>
          <span>/</span>
          <span className="text-[#0F172A] font-medium truncate max-w-[180px]">{title}</span>
        </nav>
      </div>

      {/* Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Gallery Left */}
        <div className="lg:col-span-7 space-y-3">
          <div className="aspect-[4/3] rounded-xl overflow-hidden border border-[#E5E2DC] bg-white">
            <SafeImage src={activeImage} alt={title} className="w-full h-full object-cover" />
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(img.image_url)}
                  className={`w-20 h-16 rounded-lg overflow-hidden border shrink-0 cursor-pointer ${
                    activeImage === img.image_url ? 'border-[#B91C1C] ring-1 ring-[#B91C1C]' : 'border-[#E5E2DC]'
                  }`}
                >
                  <SafeImage src={img.image_url} alt={img.alt_text || title} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sticky Purchase Module Right */}
        <div className="lg:col-span-5 bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => navigate(`/store/${product.cooperative_slug}`)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer"
            >
              <Store className="w-3.5 h-3.5" />
              <span>{lang === 'ne' ? product.store_name_ne : product.store_name_en}</span>
            </button>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#78716C] font-mono">
              <span>SKU: {product.sku}</span>
              {product.origin_district && (
                <>
                  <span>·</span>
                  <span className="font-sans inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {product.origin_district}
                  </span>
                </>
              )}
              {product.producer_name && (
                <>
                  <span>·</span>
                  <span className="font-sans">{product.producer_name}</span>
                </>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#E5E2DC] flex items-baseline gap-3 tabular-nums">
            <span className="text-2xl font-bold text-[#0F172A]">{formatNPR(effectivePrice, lang)}</span>
            {hasDiscount && (
              <span className="text-sm text-[#78716C] line-through">{formatNPR(product.price_npr, lang)}</span>
            )}
            <span className="text-xs text-[#57534E]">/ {lang === 'ne' ? product.unit_label_ne : product.unit_label_en}</span>
          </div>

          {shortDesc ? (
            <p className="text-sm font-medium text-[#0F172A] leading-relaxed">{shortDesc}</p>
          ) : null}

          <p className="text-sm text-[#57534E] leading-relaxed whitespace-pre-line">{fullDesc}</p>

          <div className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
            <span className={canBuy ? 'text-[#15803D] font-medium' : 'text-[#DC2626] font-medium'}>
              {labelFor(STATUS_LABELS, canBuy ? avail : avail === 'discontinued' ? 'discontinued' : 'out_of_stock', lang)}
            </span>
            <span className="tabular-nums text-[#57534E]">
              {lang === 'ne'
                ? `मौज्दात: ${toNepaliDigits(product.stock_quantity)}`
                : `Available: ${product.stock_quantity}`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="inline-flex items-center border border-[#E5E2DC] rounded-lg h-11">
              <button
                type="button"
                disabled={!canBuy || qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-full inline-flex items-center justify-center hover:bg-[#F3F1EC] disabled:opacity-40 cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-4 text-sm font-semibold tabular-nums">
                {lang === 'ne' ? toNepaliDigits(qty) : qty}
              </span>
              <button
                type="button"
                disabled={!canBuy || qty >= product.stock_quantity}
                onClick={() => setQty((q) => Math.min(product.stock_quantity, q + 1))}
                className="w-10 h-full inline-flex items-center justify-center hover:bg-[#F3F1EC] disabled:opacity-40 cursor-pointer"
                aria-label="Increase quantity"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <Button size="lg" className="flex-1" disabled={!canBuy} onClick={handleAddToCart}>
              <ShoppingBag className="w-4 h-4" />
              {canBuy ? t('addToCart', lang) : labelFor(STATUS_LABELS, avail === 'discontinued' ? 'discontinued' : 'out_of_stock', lang)}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={wishlistBusy}
              onClick={handleWishlist}
              aria-label="Save to wishlist"
              className={savedInWishlist ? 'border-[#B91C1C] text-[#B91C1C] bg-red-50' : ''}
            >
              <Heart className={`w-4 h-4 ${savedInWishlist ? 'fill-[#B91C1C]' : ''}`} />
            </Button>
          </div>

          {deliveryConfig && (
            <div className="pt-4 border-t border-[#E5E2DC] space-y-1.5 text-xs text-[#57534E]">
              <p className="font-semibold text-[#0F172A] inline-flex items-center gap-1.5">
                <Truck className="w-4 h-4" />
                {lang === 'ne' ? 'डेलिभरी तथा भुक्तानी' : 'Delivery & Payment'}
              </p>
              <p className="tabular-nums">
                {lang === 'ne'
                  ? `डेलिभरी शुल्क: ${formatNPR(deliveryConfig.default_fee_npr, lang)} (${formatNPR(deliveryConfig.free_delivery_threshold_npr, lang)} माथि निःशुल्क)`
                  : `Standard Delivery: ${formatNPR(deliveryConfig.default_fee_npr, lang)} (Free above ${formatNPR(deliveryConfig.free_delivery_threshold_npr, lang)})`}
              </p>
              <p>
                {lang === 'ne'
                  ? 'भुक्तानी: नगद (COD), बैंक ट्रान्सफर र QR भुक्तानी उपलब्ध।'
                  : 'Accepted: Cash on Delivery (COD), Bank Transfer, and verified QR.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Rich Structured Product Details */}
      {hasRichDetails && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {details.highlights && details.highlights.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-base text-[#0F172A] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                {lang === 'ne' ? 'मुख्य विशेषताहरू' : 'Key Highlights'}
              </h2>
              <ul className="space-y-2 text-sm text-[#57534E] list-disc pl-5">
                {details.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {details.uses_and_benefits && details.uses_and_benefits.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-base text-[#0F172A]">
                {lang === 'ne' ? 'प्रयोग र फाइदाहरू' : 'Uses & Practical Benefits'}
              </h2>
              <ul className="space-y-2 text-sm text-[#57534E] list-disc pl-5">
                {details.uses_and_benefits.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}

          {details.known_specifications && details.known_specifications.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-base text-[#0F172A]">
                {lang === 'ne' ? 'उत्पादन विवरण (Specifications)' : 'Product Specifications'}
              </h2>
              <dl className="divide-y divide-[#F3F1EC] text-sm">
                {details.known_specifications.map((s, i) => (
                  <div key={i} className="py-2 flex justify-between gap-4">
                    <dt className="text-[#57534E]">{s.label}</dt>
                    <dd className="font-medium text-[#0F172A] text-right">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {details.ingredients_or_materials && details.ingredients_or_materials.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3">
              <h2 className="font-semibold text-base text-[#0F172A]">
                {lang === 'ne' ? 'कच्चा पदार्थ / सामग्री' : 'Ingredients / Raw Materials'}
              </h2>
              <div className="flex flex-wrap gap-2">
                {details.ingredients_or_materials.map((ing, i) => (
                  <span key={i} className="text-xs px-3 py-1 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-[#0F172A]">
                    {ing}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(details.preparation_or_usage || details.storage_instructions || details.handling_instructions || details.packaging_suggestions) && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-3 lg:col-span-2">
              <h2 className="font-semibold text-base text-[#0F172A] flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-[#B91C1C]" />
                {lang === 'ne' ? 'प्रयोग, भण्डारण तथा ह्यान्डलिङ जानकारी' : 'Usage, Storage & Handling Guidance'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-[#57534E]">
                {details.preparation_or_usage && (
                  <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">
                      {lang === 'ne' ? 'तयारी र प्रयोग विधि' : 'Preparation & Usage'}
                    </p>
                    <p>{details.preparation_or_usage}</p>
                  </div>
                )}
                {details.storage_instructions && (
                  <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">
                      {lang === 'ne' ? 'भण्डारण र संरक्षण' : 'Storage & Preservation'}
                    </p>
                    <p>{details.storage_instructions}</p>
                  </div>
                )}
                {details.handling_instructions && (
                  <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">
                      {lang === 'ne' ? 'ढुवानी तथा ह्यान्डलिङ' : 'Handling Instructions'}
                    </p>
                    <p>{details.handling_instructions}</p>
                  </div>
                )}
                {details.packaging_suggestions && (
                  <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
                    <p className="text-xs font-semibold text-[#0F172A] mb-1">
                      {lang === 'ne' ? 'प्याकेजिङ जानकारी' : 'Packaging & Presentation'}
                    </p>
                    <p>{details.packaging_suggestions}</p>
                  </div>
                )}
              </div>
              {details.safety_precautions && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{lang === 'ne' ? 'सावधानी: ' : 'Safety Precautions: '}</span>
                    {details.safety_precautions}
                  </div>
                </div>
              )}
            </div>
          )}

          {details.recipe_suggestions && details.recipe_suggestions.length > 0 && (
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 lg:col-span-2">
              <h2 className="font-semibold text-base text-[#0F172A] flex items-center gap-2">
                <ChefHat className="w-4 h-4 text-[#B91C1C]" />
                {lang === 'ne' ? 'परम्परागत परिकार / रेसिपी सुझाव' : 'Suggested Recipes'}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {details.recipe_suggestions.map((rec, i) => (
                  <div key={i} className="p-4 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] space-y-2 text-xs">
                    <h3 className="font-semibold text-sm text-[#0F172A]">{rec.title}</h3>
                    {rec.ingredients.length > 0 && (
                      <p className="text-[#57534E]">
                        <strong className="text-[#0F172A]">{lang === 'ne' ? 'सामग्री: ' : 'Ingredients: '}</strong>
                        {rec.ingredients.join(', ')}
                      </p>
                    )}
                    {rec.steps.length > 0 && (
                      <ol className="list-decimal pl-4 space-y-1 text-[#57534E]">
                        {rec.steps.map((st, si) => (
                          <li key={si}>{st}</li>
                        ))}
                      </ol>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section className="space-y-5">
          <h2 className="font-display text-2xl font-bold text-[#0F172A]">
            {lang === 'ne' ? 'यसै सहकारीका अन्य उत्पादनहरू' : 'More from this Cooperative'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((r) => (
              <ProductCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
