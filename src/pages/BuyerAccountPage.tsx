import { useEffect, useState } from 'react';
import { Heart, LogOut, MapPin, Package, RotateCcw, Store, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, NEPAL_PROVINCES, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { toast } from 'sonner';

interface BuyerOrderItem {
  product_id: string;
  product_slug: string | null;
  cooperative_id: string;
  cooperative_slug: string | null;
  store_name_ne: string | null;
  store_name_en: string | null;
  product_name_ne: string;
  product_name_en: string;
  quantity: number;
  unit_price_npr: number;
  unit_label: string;
  stock_quantity: number;
  availability_status: string;
  product_status: string;
  image_url: string | null;
}

interface BuyerOrder {
  id: string;
  order_number: string;
  guest_access_token: string;
  store_name_ne: string;
  store_name_en: string;
  status: string;
  total_npr: number;
  created_at: string;
  items: BuyerOrderItem[];
}

export function BuyerAccountPage() {
  const { lang, user, logout, navigate, addToCart } = useApp();
  const [tab, setTab] = useState<'orders' | 'addresses' | 'wishlist'>('orders');
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [addresses, setAddresses] = useState<
    Array<{
      id: string;
      label: string;
      recipient_name: string;
      phone: string;
      province: string;
      district: string;
      municipality: string;
      ward_number: string;
      street_address: string;
    }>
  >([]);
  const [wishlist, setWishlist] = useState<
    Array<{
      id: string;
      slug: string;
      name_ne: string;
      name_en: string;
      price_npr: number;
      discount_price_npr: number | null;
      store_name_ne: string;
      store_name_en: string;
    }>
  >([]);
  const [savingAddr, setSavingAddr] = useState(false);
  const [deleteAddrTarget, setDeleteAddrTarget] = useState<{ id: string; label: string } | null>(null);
  const [deletingAddr, setDeletingAddr] = useState(false);
  const [removingWishId, setRemovingWishId] = useState<string | null>(null);

  const [newAddr, setNewAddr] = useState({
    label: 'Home',
    recipientName: '',
    phone: '',
    province: 'बागमती प्रदेश',
    district: 'काठमाडौँ',
    municipality: '',
    wardNumber: '',
    streetAddress: '',
  });

  const loadData = async () => {
    setLoading(true);
    const [ordRes, addrRes, wishRes] = await Promise.all([
      apiFetch<{ orders: BuyerOrder[] }>('/api/buyer/orders'),
      apiFetch<{ addresses: typeof addresses }>('/api/buyer/addresses'),
      apiFetch<{ items: typeof wishlist }>('/api/buyer/wishlist'),
    ]);
    setLoading(false);
    if (ordRes.ok) setOrders(ordRes.data.orders);
    else toast.error(ordRes.error || (lang === 'ne' ? 'अर्डर लोड गर्न सकिएन।' : 'Failed to load orders.'));
    if (addrRes.ok) setAddresses(addrRes.data.addresses);
    if (wishRes.ok) setWishlist(wishRes.data.items);
  };

  useEffect(() => {
    if (user) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center space-y-4">
        <p className="text-sm text-[#57534E]">{lang === 'ne' ? 'कृपया पहिले लगइन गर्नुहोस्।' : 'Please sign in first.'}</p>
        <Button onClick={() => navigate('/login')}>{lang === 'ne' ? 'लगइन' : 'Sign In'}</Button>
      </div>
    );
  }

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAddr(true);
    const res = await apiFetch('/api/buyer/addresses', { method: 'POST', body: JSON.stringify(newAddr) });
    setSavingAddr(false);
    if (!res.ok) {
      toast.error(res.error || (lang === 'ne' ? 'ठेगाना थप्न सकिएन।' : 'Could not save address.'));
      return;
    }
    toast.success(lang === 'ne' ? 'ठेगाना सुरक्षित भयो।' : 'Address saved.');
    setNewAddr({ ...newAddr, recipientName: '', phone: '', municipality: '', wardNumber: '', streetAddress: '' });
    loadData();
  };

  const handleDeleteAddress = async () => {
    if (!deleteAddrTarget) return;
    setDeletingAddr(true);
    const res = await apiFetch(`/api/buyer/addresses/${deleteAddrTarget.id}`, { method: 'DELETE' });
    setDeletingAddr(false);
    if (!res.ok) {
      toast.error(res.error || (lang === 'ne' ? 'ठेगाना हटाउन सकिएन।' : 'Failed to remove address.'));
      return;
    }
    toast.success(lang === 'ne' ? 'ठेगाना हटाइयो।' : 'Address removed.');
    setDeleteAddrTarget(null);
    loadData();
  };

  const handleRemoveWishlist = async (productId: string) => {
    setRemovingWishId(productId);
    const res = await apiFetch<{ saved: boolean }>('/api/buyer/wishlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    });
    setRemovingWishId(null);
    if (!res.ok) {
      toast.error(res.error || (lang === 'ne' ? 'इच्छा सूची अद्यावधिक असफल भयो।' : 'Failed to update wishlist.'));
      return;
    }
    setWishlist((prev) => prev.filter((item) => item.id !== productId));
    toast.success(lang === 'ne' ? 'इच्छा सूचीबाट हटाइयो।' : 'Removed from wishlist.');
  };

  const handleReorder = (ord: BuyerOrder) => {
    let addedCount = 0;
    const skipped: string[] = [];

    for (const item of ord.items || []) {
      const isAvailable =
        item.product_status === 'published' &&
        item.availability_status !== 'discontinued' &&
        item.availability_status !== 'out_of_stock' &&
        Number(item.stock_quantity || 0) > 0 &&
        Boolean(item.cooperative_id);

      if (!isAvailable) {
        skipped.push(lang === 'ne' ? item.product_name_ne : item.product_name_en);
        continue;
      }

      const qty = Math.min(Math.max(1, Number(item.quantity || 1)), Number(item.stock_quantity || 1));
      addToCart(
        {
          productId: item.product_id,
          slug: item.product_slug || item.product_id,
          cooperativeId: item.cooperative_id,
          cooperativeSlug: item.cooperative_slug || '',
          storeNameNe: item.store_name_ne || ord.store_name_ne,
          storeNameEn: item.store_name_en || ord.store_name_en,
          nameNe: item.product_name_ne,
          nameEn: item.product_name_en,
          priceNpr: item.unit_price_npr,
          discountPriceNpr: null,
          unitLabelNe: item.unit_label,
          unitLabelEn: item.unit_label,
          imageUrl: item.image_url || '',
          stockQuantity: Number(item.stock_quantity || 1),
        },
        qty
      );
      addedCount += 1;
    }

    if (skipped.length > 0) {
      toast.warning(
        lang === 'ne'
          ? `केही सामग्री हाल उपलब्ध नभएकोले कार्टमा थपिएन: ${skipped.join(', ')}`
          : `Unavailable items skipped: ${skipped.join(', ')}`
      );
    }

    if (addedCount === 0) {
      toast.error(
        lang === 'ne'
          ? 'यो अर्डरका कुनै पनि उत्पादन हाल पुनः अर्डरको लागि उपलब्ध छैनन्।'
          : 'None of the items in this order are currently available for reorder.'
      );
      return;
    }

    toast.success(
      lang === 'ne' ? `${toNepaliDigits(addedCount)} उत्पादन कार्टमा थपियो।` : `${addedCount} item(s) added to cart.`
    );
    navigate('/checkout');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E2DC] pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">{user.full_name}</h1>
          <p className="text-xs text-[#57534E]">
            {user.email || user.phone} · {user.role}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user.role === 'buyer' && (
            <Button variant="outline" onClick={() => navigate('/register-cooperative')}>
              <Store className="w-4 h-4" />
              {lang === 'ne' ? 'सहकारी पसल दर्ता / अपग्रेड' : 'Register Cooperative'}
            </Button>
          )}
          {(user.role === 'cooperative_admin' || user.role === 'cooperative_staff') && (
            <Button variant="outline" onClick={() => navigate('/cooperative')}>
              {lang === 'ne' ? 'सहकारी ड्यासबोर्ड' : 'Cooperative Dashboard'}
            </Button>
          )}
          {user.role === 'super_admin' && (
            <Button variant="outline" onClick={() => navigate('/super-admin')}>
              {lang === 'ne' ? 'सुपर एडमिन' : 'Super Admin'}
            </Button>
          )}
          <Button variant="outline" onClick={logout}>
            <LogOut className="w-4 h-4" />
            {lang === 'ne' ? 'बाहिर निस्कनुहोस्' : 'Sign Out'}
          </Button>
        </div>
      </div>

      {user.role === 'buyer' && (
        <div className="bg-[#FAF9F6] border border-[#E5E2DC] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#0F172A]">
              {lang === 'ne'
                ? 'गल्तीले क्रेता (Buyer) खाता खोल्नुभएको हो वा सहकारी पसल चलाउनुहुन्छ?'
                : 'Registered as a Buyer by mistake or opening a Cooperative Store?'}
            </p>
            <p className="text-xs text-[#57534E]">
              {lang === 'ne'
                ? 'तपाईंले यही मोबाइल नम्बर र इमेल प्रयोग गरी आफ्नो क्रेता खातालाई सिधै सहकारी प्रशासक (Cooperative Admin) मा अपग्रेड गर्न सक्नुहुन्छ।'
                : 'You can upgrade this exact account using the same email and phone number without creating a new account.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/register-cooperative')} className="shrink-0">
            <Store className="w-4 h-4" />
            {lang === 'ne' ? 'सहकारी दर्ता गर्नुहोस्' : 'Upgrade & Register'}
          </Button>
        </div>
      )}

      <div className="flex gap-2 border-b border-[#E5E2DC] overflow-x-auto">
        {[
          { id: 'orders', ne: 'अर्डर इतिहास', en: 'Orders', count: orders.length },
          { id: 'addresses', ne: 'ठेगानाहरू', en: 'Addresses', count: addresses.length },
          { id: 'wishlist', ne: 'इच्छा सूची', en: 'Wishlist', count: wishlist.length },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as 'orders' | 'addresses' | 'wishlist')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 cursor-pointer whitespace-nowrap ${
              tab === t.id ? 'border-[#B91C1C] text-[#0F172A]' : 'border-transparent text-[#57534E]'
            }`}
          >
            {lang === 'ne' ? t.ne : t.en} ({lang === 'ne' ? toNepaliDigits(t.count) : t.count})
          </button>
        ))}
      </div>

      {loading && orders.length === 0 && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-[#F3F1EC] animate-pulse" />
          ))}
        </div>
      )}

      {tab === 'orders' && !loading && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E] space-y-3">
              <Package className="w-8 h-8 mx-auto opacity-50" />
              <p>{lang === 'ne' ? 'अहिलेसम्म कुनै अर्डर छैन।' : 'No orders placed yet.'}</p>
              <Button size="sm" variant="outline" onClick={() => navigate('/marketplace')}>
                {lang === 'ne' ? 'बजारमा जानुहोस्' : 'Explore Marketplace'}
              </Button>
            </div>
          ) : (
            orders.map((ord) => (
              <div key={ord.id} className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-[#78716C]">{ord.order_number}</p>
                    <p className="font-semibold text-sm text-[#0F172A]">
                      {lang === 'ne' ? ord.store_name_ne : ord.store_name_en}
                    </p>
                    <p className="text-xs text-[#57534E]">{formatDateBS(ord.created_at, lang)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm tabular-nums">{formatNPR(ord.total_npr, lang)}</p>
                    <p className="text-xs text-[#15803D]">{labelFor(STATUS_LABELS, ord.status, lang)}</p>
                  </div>
                </div>
                {ord.items && ord.items.length > 0 && (
                  <div className="bg-[#FAF9F6] rounded-lg px-3 py-2 text-xs text-[#57534E] space-y-1">
                    {ord.items.map((item, idx) => (
                      <div key={`${item.product_id}-${idx}`} className="flex justify-between gap-2">
                        <span className="truncate">
                          {lang === 'ne' ? item.product_name_ne : item.product_name_en} ×{' '}
                          {lang === 'ne' ? toNepaliDigits(item.quantity) : item.quantity} ({item.unit_label})
                        </span>
                        <span className="tabular-nums font-medium shrink-0">
                          {formatNPR(item.unit_price_npr * item.quantity, lang)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#F3F1EC]">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate(`/track-order?orderNumber=${ord.order_number}&token=${ord.guest_access_token}`)
                    }
                  >
                    {lang === 'ne' ? 'विवरण / बिल' : 'Details / Invoice'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReorder(ord)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                    {lang === 'ne' ? 'पुनः अर्डर' : 'Reorder'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'addresses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            {addresses.length === 0 ? (
              <div className="p-8 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E]">
                <MapPin className="w-7 h-7 mx-auto mb-2 opacity-40" />
                {lang === 'ne' ? 'कुनै सुरक्षित ठेगाना छैन।' : 'No saved addresses yet.'}
              </div>
            ) : (
              addresses.map((a) => (
                <div key={a.id} className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex justify-between items-start">
                  <div className="text-sm space-y-0.5">
                    <p className="font-semibold text-[#0F172A] flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#B91C1C]" /> {a.label} — {a.recipient_name}
                    </p>
                    <p className="text-xs text-[#57534E] tabular-nums">{a.phone}</p>
                    <p className="text-xs text-[#57534E]">
                      {a.street_address}, {a.municipality}-{a.ward_number}, {a.district}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={lang === 'ne' ? 'ठेगाना हटाउनुहोस्' : 'Delete address'}
                    onClick={() => setDeleteAddrTarget({ id: a.id, label: `${a.label} (${a.recipient_name})` })}
                    className="text-[#78716C] hover:text-[#DC2626] p-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddAddress} className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
            <h3 className="font-semibold text-sm">{lang === 'ne' ? 'नयाँ ठेगाना थप्नुहोस्' : 'Add New Address'}</h3>
            <Input
              required
              placeholder={lang === 'ne' ? 'प्राप्तकर्ताको नाम' : 'Recipient Name'}
              value={newAddr.recipientName}
              onChange={(e) => setNewAddr({ ...newAddr, recipientName: e.target.value })}
            />
            <Input
              required
              placeholder="98XXXXXXXX"
              value={newAddr.phone}
              onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={newAddr.province}
                onChange={(e) =>
                  setNewAddr({
                    ...newAddr,
                    province: e.target.value,
                    district: NEPAL_PROVINCES[e.target.value]?.districts[0] || '',
                  })
                }
              >
                {Object.keys(NEPAL_PROVINCES).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <Select value={newAddr.district} onChange={(e) => setNewAddr({ ...newAddr, district: e.target.value })}>
                {(NEPAL_PROVINCES[newAddr.province]?.districts || []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                required
                placeholder={lang === 'ne' ? 'नगरपालिका' : 'Municipality'}
                value={newAddr.municipality}
                onChange={(e) => setNewAddr({ ...newAddr, municipality: e.target.value })}
              />
              <Input
                required
                placeholder={lang === 'ne' ? 'वडा नं.' : 'Ward'}
                value={newAddr.wardNumber}
                onChange={(e) => setNewAddr({ ...newAddr, wardNumber: e.target.value })}
              />
            </div>
            <Input
              required
              placeholder={lang === 'ne' ? 'टोल / घर नं.' : 'Street Address'}
              value={newAddr.streetAddress}
              onChange={(e) => setNewAddr({ ...newAddr, streetAddress: e.target.value })}
            />
            <Button type="submit" className="w-full" disabled={savingAddr}>
              {savingAddr
                ? lang === 'ne'
                  ? 'सुरक्षित हुँदै...'
                  : 'Saving...'
                : lang === 'ne'
                ? 'ठेगाना सुरक्षित गर्नुहोस्'
                : 'Save Address'}
            </Button>
          </form>
        </div>
      )}

      {tab === 'wishlist' && (
        <>
          {wishlist.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E] space-y-3">
              <Heart className="w-8 h-8 mx-auto opacity-40" />
              <p>{lang === 'ne' ? 'इच्छा सूची खाली छ।' : 'Your wishlist is empty.'}</p>
              <Button size="sm" variant="outline" onClick={() => navigate('/marketplace')}>
                {lang === 'ne' ? 'उत्पादनहरू हेर्नुहोस्' : 'Browse Products'}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {wishlist.map((w) => (
                <div key={w.id} className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[#0F172A] truncate">
                      {lang === 'ne' ? w.name_ne : w.name_en}
                    </p>
                    <p className="text-xs text-[#57534E] truncate">{lang === 'ne' ? w.store_name_ne : w.store_name_en}</p>
                    <p className="text-sm font-bold text-[#B91C1C] tabular-nums mt-1">
                      {formatNPR(w.discount_price_npr || w.price_npr, lang)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/product/${w.slug}`)}>
                      {lang === 'ne' ? 'हेर्नुहोस्' : 'View'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={removingWishId === w.id}
                      aria-label={lang === 'ne' ? 'हटाउनुहोस्' : 'Remove'}
                      onClick={() => handleRemoveWishlist(w.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteAddrTarget)}
        variant="destructive"
        title={lang === 'ne' ? 'ठेगाना हटाउनुहोस्?' : 'Delete Saved Address?'}
        description={
          lang === 'ne'
            ? `"${deleteAddrTarget?.label || ''}" ठेगाना स्थायी रूपमा हटाउने निश्चित हुनुहुन्छ?`
            : `Are you sure you want to delete "${deleteAddrTarget?.label || ''}"?`
        }
        confirmLabel={lang === 'ne' ? 'हटाउनुहोस्' : 'Delete'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={deletingAddr}
        onConfirm={handleDeleteAddress}
        onCancel={() => setDeleteAddrTarget(null)}
      />
    </div>
  );
}

