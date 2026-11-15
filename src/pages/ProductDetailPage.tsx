import { useEffect, useState } from 'react';
import { ArrowLeft, Heart, MapPin, Minus, Plus, ShoppingBag, Store, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatNPR, toNepaliDigits } from '../lib/bs-date';
import { t } from '../lib/i18n';
import { SafeImage } from '../components/SafeImage';
import { ProductCard, type ProductRecord } from '../components/ProductCard';
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

  useEffect(() => {
    setError('');
    setQty(1);
    apiFetch<ProductDetailResponse>(`/api/public/products/${slug}`).then((res) => {
      if (res.ok) {
        setData(res.data);
        setActiveImage(res.data.images[0]?.image_url || '/images/product-ilam-tea.jpg');
      } else {
        setError(res.error || 'उत्पादन फेला परेन।');
      }
    });
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-lg font-semibold text-[#0F172A]">{error}</p>
        <Button onClick={() => navigate('/marketplace')}>
          {lang === 'ne' ? 'बजारमा फर्कनुहोस्' : 'Back to Marketplace'}
        </Button>
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

  const handleAddToCart = () => {
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
    const res = await apiFetch<{ saved: boolean }>('/api/buyer/wishlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id }),
    });
    if (res.ok) {
      toast.success(
        res.data.saved
          ? lang === 'ne'
            ? 'इच्छा सूचीमा सुरक्षित गरियो'
            : 'Saved to wishlist'
          : lang === 'ne'
          ? 'इच्छा सूचीबाट हटाइयो'
          : 'Removed from wishlist'
      );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-14">
      <button
        type="button"
        onClick={() => navigate('/marketplace')}
        className="inline-flex items-center gap-1.5 text-sm text-[#57534E] hover:text-[#0F172A] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{lang === 'ne' ? 'बजारमा फर्कनुहोस्' : 'Back to Marketplace'}</span>
      </button>

      {/* Contiguous Purchase Module */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Gallery Left */}
        <div className="lg:col-span-7 space-y-3">
          <div className="aspect-[4/3] rounded-xl overflow-hidden border border-[#E5E2DC] bg-white">
            <SafeImage src={activeImage} alt={title} className="w-full h-full object-cover" />
          </div>
          {images.length > 1 && (
            <div className="flex gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(img.image_url)}
                  className={`w-20 h-16 rounded-lg overflow-hidden border cursor-pointer ${
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

          <p className="text-sm text-[#57534E] leading-relaxed">
            {lang === 'ne' ? product.description_ne : product.description_en}
          </p>

          <div className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC]">
            <span className={product.stock_quantity > 0 ? 'text-[#15803D] font-medium' : 'text-[#DC2626] font-medium'}>
              {product.stock_quantity > 0 ? t('inStock', lang) : t('outOfStock', lang)}
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
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-full inline-flex items-center justify-center hover:bg-[#F3F1EC] cursor-pointer"
                aria-label="Decrease quantity"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="px-4 text-sm font-semibold tabular-nums">
                {lang === 'ne' ? toNepaliDigits(qty) : qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(product.stock_quantity, q + 1))}
                className="w-10 h-full inline-flex items-center justify-center hover:bg-[#F3F1EC] cursor-pointer"
                aria-label="Increase quantity"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <Button
              size="lg"
              className="flex-1"
              disabled={product.stock_quantity <= 0}
              onClick={handleAddToCart}
            >
              <ShoppingBag className="w-4 h-4" />
              {t('addToCart', lang)}
            </Button>

            <Button type="button" variant="outline" size="icon" onClick={handleWishlist} aria-label="Save to wishlist">
              <Heart className="w-4 h-4" />
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
