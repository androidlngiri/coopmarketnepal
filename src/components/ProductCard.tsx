import { ShoppingBag } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatNPR } from '../lib/bs-date';
import { labelFor, STATUS_LABELS, t } from '../lib/i18n';
import { SafeImage } from './SafeImage';
import { toast } from 'sonner';

export interface ProductAiDetails {
  product_type_detected?: string;
  highlights?: string[];
  known_specifications?: Array<{ label: string; value: string }>;
  ingredients_or_materials?: string[];
  uses_and_benefits?: string[];
  preparation_or_usage?: string;
  recipe_suggestions?: Array<{ title: string; ingredients: string[]; steps: string[] }>;
  storage_instructions?: string;
  handling_instructions?: string;
  safety_precautions?: string;
  packaging_suggestions?: string;
  needs_confirmation?: string[];
}

export interface ProductRecord {
  id: string;
  slug: string;
  cooperative_id: string;
  cooperative_slug: string;
  store_name_ne: string;
  store_name_en: string;
  cooperative_district?: string;
  name_ne: string;
  name_en: string;
  short_description_ne?: string | null;
  short_description_en?: string | null;
  price_npr: number;
  discount_price_npr: number | null;
  unit_label_ne: string;
  unit_label_en: string;
  stock_quantity: number;
  availability_status?: string;
  image_url?: string | null;
  category_name_ne?: string | null;
  category_name_en?: string | null;
  category_slug?: string | null;
  ai_details_json?: ProductAiDetails | null;
  seo_title_ne?: string | null;
  seo_title_en?: string | null;
  seo_meta_description_ne?: string | null;
  seo_meta_description_en?: string | null;
  seo_keywords_json?: string[] | null;
  ai_assisted?: boolean;
}

export function ProductCard({ product }: { product: ProductRecord }) {
  const { lang, navigate, addToCart } = useApp();
  const effectivePrice =
    product.discount_price_npr && product.discount_price_npr > 0 ? product.discount_price_npr : product.price_npr;
  const hasDiscount = Boolean(product.discount_price_npr && product.discount_price_npr < product.price_npr);
  const title = lang === 'ne' ? product.name_ne : product.name_en;
  const storeName = lang === 'ne' ? product.store_name_ne : product.store_name_en;
  const unitLabel = lang === 'ne' ? product.unit_label_ne : product.unit_label_en;
  const avail = product.availability_status || 'in_stock';
  const canBuy =
    avail !== 'out_of_stock' &&
    avail !== 'discontinued' &&
    product.stock_quantity > 0;

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canBuy) return;
    addToCart({
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
      imageUrl: product.image_url || '',
      stockQuantity: product.stock_quantity,
    });
    toast.success(lang === 'ne' ? `${title} कार्टमा थपियो` : `${title} added to cart`);
  };

  return (
    <article
      onClick={() => navigate(`/product/${product.slug}`)}
      className="group bg-white border border-[#E5E2DC] rounded-xl overflow-hidden flex flex-col transition-transform duration-150 hover:-translate-y-0.5 cursor-pointer"
    >
      <div className="aspect-[4/3] w-full bg-[#F3F1EC] overflow-hidden relative">
        <SafeImage
          src={product.image_url}
          alt={title}
          fallbackLabel={title}
          variant="product"
          lang={lang}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {avail === 'preorder' && canBuy && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#0F172A]/85 text-white text-[10px] font-semibold">
            {labelFor(STATUS_LABELS, 'preorder', lang)}
          </span>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-[#78716C] truncate">
            {product.cooperative_slug ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/store/${product.cooperative_slug}`);
                }}
                className="truncate hover:text-[#B91C1C] hover:underline cursor-pointer"
              >
                {storeName}
              </button>
            ) : (
              <span className="truncate">{storeName}</span>
            )}
            {product.cooperative_district && (
              <>
                <span aria-hidden="true">·</span>
                <span className="shrink-0">{product.cooperative_district}</span>
              </>
            )}
          </div>
          <h3 className="text-base font-semibold text-[#0F172A] leading-snug line-clamp-2">{title}</h3>
          <p className="text-xs text-[#57534E]">{unitLabel}</p>
        </div>

        <div className="pt-2 border-t border-[#F3F1EC] flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-[15px] font-bold text-[#0F172A]">{formatNPR(effectivePrice, lang)}</span>
            {hasDiscount && (
              <span className="text-xs text-[#78716C] line-through">{formatNPR(product.price_npr, lang)}</span>
            )}
          </div>

          <button
            type="button"
            disabled={!canBuy}
            onClick={handleAdd}
            className="h-9 px-3 rounded-lg bg-[#0F172A] text-white hover:bg-[#B91C1C] disabled:bg-[#E5E2DC] disabled:text-[#78716C] disabled:cursor-not-allowed text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>
              {canBuy
                ? t('addToCart', lang)
                : avail === 'discontinued'
                ? labelFor(STATUS_LABELS, 'discontinued', lang)
                : t('outOfStock', lang)}
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
