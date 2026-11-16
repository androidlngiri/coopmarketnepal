import { useEffect } from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatNPR, toNepaliDigits } from '../lib/bs-date';
import { t } from '../lib/i18n';
import { SafeImage } from './SafeImage';
import { Button } from './ui/button';

export function CartDrawer() {
  const { lang, cart, cartOpen, setCartOpen, updateCartQty, removeFromCart, navigate } = useApp();

  useEffect(() => {
    if (!cartOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCartOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cartOpen, setCartOpen]);

  if (!cartOpen) return null;

  // Group items by cooperative so buyers see transparent multi-cooperative splitting
  const grouped = cart.reduce<Record<string, typeof cart>>((acc, item) => {
    if (!acc[item.cooperativeId]) acc[item.cooperativeId] = [];
    acc[item.cooperativeId].push(item);
    return acc;
  }, {});

  const subtotal = cart.reduce((sum, item) => {
    const unit = item.discountPriceNpr && item.discountPriceNpr > 0 ? item.discountPriceNpr : item.priceNpr;
    return sum + unit * item.quantity;
  }, 0);

  const coopCount = Object.keys(grouped).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setCartOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md bg-white h-full flex flex-col border-l border-[#E5E2DC]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#E5E2DC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#B91C1C]" />
            <h2 className="font-semibold text-base text-[#0F172A]">
              {t('cart', lang)} ({lang === 'ne' ? toNepaliDigits(cart.length) : cart.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-[#F3F1EC] cursor-pointer"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {cart.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <ShoppingBag className="w-10 h-10 mx-auto text-[#78716C]" />
              <p className="text-sm text-[#57534E]">
                {lang === 'ne' ? 'तपाईंको कार्ट खाली छ।' : 'Your shopping cart is empty.'}
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/marketplace');
                }}
              >
                {t('exploreMarketplace', lang)}
              </Button>
            </div>
          ) : (
            <>
              {coopCount > 1 && (
                <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? `${toNepaliDigits(coopCount)} वटा फरक सहकारीका उत्पादनहरू छन् — चेकआउटमा प्रत्येक सहकारीको छुट्टै अर्डर स्वतः बन्नेछ।`
                    : `Items from ${coopCount} cooperatives — orders will automatically split per cooperative at checkout.`}
                </div>
              )}

              {Object.entries(grouped).map(([coopId, items]) => {
                const storeName = lang === 'ne' ? items[0].storeNameNe : items[0].storeNameEn;
                return (
                  <div key={coopId} className="space-y-3 pb-4 border-b border-[#E5E2DC] last:border-b-0">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#57534E]">
                      <span>{storeName}</span>
                      {items[0].cooperativeSlug && (
                        <button
                          type="button"
                          onClick={() => {
                            setCartOpen(false);
                            navigate(`/store/${items[0].cooperativeSlug}`);
                          }}
                          className="text-[#B91C1C] hover:underline cursor-pointer"
                        >
                          {t('viewStore', lang)}
                        </button>
                      )}
                    </div>

                    {items.map((item) => {
                      const unitPrice =
                        item.discountPriceNpr && item.discountPriceNpr > 0 ? item.discountPriceNpr : item.priceNpr;
                      const maxStock = Math.max(1, item.stockQuantity || 99);
                      const atStockMax = item.quantity >= maxStock;
                      const openProduct = () => {
                        if (!item.slug) return;
                        setCartOpen(false);
                        navigate(`/product/${item.slug}`);
                      };
                      return (
                        <div key={item.productId} className="flex gap-3">
                          <button type="button" onClick={openProduct} className="shrink-0 cursor-pointer">
                            <SafeImage
                              src={item.imageUrl}
                              alt={lang === 'ne' ? item.nameNe : item.nameEn}
                              variant="product"
                              compact
                              lang={lang}
                              className="w-16 h-16 rounded-lg border border-[#E5E2DC]"
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={openProduct}
                              className="text-left text-sm font-medium text-[#0F172A] hover:text-[#B91C1C] truncate block w-full cursor-pointer"
                            >
                              {lang === 'ne' ? item.nameNe : item.nameEn}
                            </button>
                            <p className="text-xs text-[#57534E] tabular-nums">
                              {formatNPR(unitPrice, lang)} · {lang === 'ne' ? item.unitLabelNe : item.unitLabelEn}
                            </p>
                            <div className="mt-2 flex items-center justify-between">
                              <div className="inline-flex items-center border border-[#E5E2DC] rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                                  className="h-7 w-7 inline-flex items-center justify-center hover:bg-[#F3F1EC] cursor-pointer"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-2.5 text-xs font-medium tabular-nums">
                                  {lang === 'ne' ? toNepaliDigits(item.quantity) : item.quantity}
                                </span>
                                <button
                                  type="button"
                                  disabled={atStockMax}
                                  onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                                  className="h-7 w-7 inline-flex items-center justify-center hover:bg-[#F3F1EC] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFromCart(item.productId)}
                                className="text-[#78716C] hover:text-[#DC2626] p-1 cursor-pointer"
                                aria-label="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-5 border-t border-[#E5E2DC] bg-[#FAF9F6] space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#57534E]">{lang === 'ne' ? 'उप-जम्मा (डेलिभरी बाहेक)' : 'Subtotal (excl. delivery)'}</span>
              <span className="text-base font-bold text-[#0F172A] tabular-nums">{formatNPR(subtotal, lang)}</span>
            </div>
            <p className="text-xs text-[#57534E]">{t('guestCheckoutNote', lang)}</p>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                setCartOpen(false);
                navigate('/checkout');
              }}
            >
              {t('checkout', lang)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
