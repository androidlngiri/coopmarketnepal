import { useEffect, useState } from 'react';
import { LogOut, MapPin, Package, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, NEPAL_PROVINCES } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

interface BuyerOrder {
  id: string;
  order_number: string;
  guest_access_token: string;
  store_name_ne: string;
  store_name_en: string;
  status: string;
  total_npr: number;
  created_at: string;
  items: Array<{
    product_id: string;
    product_name_ne: string;
    product_name_en: string;
    quantity: number;
    unit_price_npr: number;
    unit_label: string;
  }>;
}

export function BuyerAccountPage() {
  const { lang, user, logout, navigate, addToCart } = useApp();
  const [tab, setTab] = useState<'orders' | 'addresses' | 'wishlist'>('orders');
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
    const [ordRes, addrRes, wishRes] = await Promise.all([
      apiFetch<{ orders: BuyerOrder[] }>('/api/buyer/orders'),
      apiFetch<{ addresses: typeof addresses }>('/api/buyer/addresses'),
      apiFetch<{ items: typeof wishlist }>('/api/buyer/wishlist'),
    ]);
    if (ordRes.ok) setOrders(ordRes.data.orders);
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
    const res = await apiFetch('/api/buyer/addresses', { method: 'POST', body: JSON.stringify(newAddr) });
    if (!res.ok) {
      toast.error(res.error || 'ठेगाना थप्न सकिएन।');
      return;
    }
    toast.success(lang === 'ne' ? 'ठेगाना सुरक्षित भयो।' : 'Address saved.');
    setNewAddr({ ...newAddr, recipientName: '', phone: '', municipality: '', wardNumber: '', streetAddress: '' });
    loadData();
  };

  const handleReorder = (ord: BuyerOrder) => {
    for (const item of ord.items) {
      addToCart(
        {
          productId: item.product_id,
          slug: item.product_id,
          cooperativeId: '',
          cooperativeSlug: '',
          storeNameNe: ord.store_name_ne,
          storeNameEn: ord.store_name_en,
          nameNe: item.product_name_ne,
          nameEn: item.product_name_en,
          priceNpr: item.unit_price_npr,
          discountPriceNpr: null,
          unitLabelNe: item.unit_label,
          unitLabelEn: item.unit_label,
          imageUrl: '/images/product-ilam-tea.jpg',
          stockQuantity: 99,
        },
        item.quantity
      );
    }
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
        <div className="flex gap-2">
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

      <div className="flex gap-2 border-b border-[#E5E2DC]">
        {[
          { id: 'orders', ne: 'अर्डर इतिहास', en: 'Orders' },
          { id: 'addresses', ne: 'ठेगानाहरू', en: 'Addresses' },
          { id: 'wishlist', ne: 'इच्छा सूची', en: 'Wishlist' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as 'orders' | 'addresses' | 'wishlist')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 cursor-pointer ${
              tab === t.id ? 'border-[#B91C1C] text-[#0F172A]' : 'border-transparent text-[#57534E]'
            }`}
          >
            {lang === 'ne' ? t.ne : t.en}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-12 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E]">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {lang === 'ne' ? 'अहिलेसम्म कुनै अर्डर छैन।' : 'No orders placed yet.'}
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
                <div className="flex gap-2 pt-2 border-t border-[#F3F1EC]">
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
            {addresses.map((a) => (
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
                  onClick={async () => {
                    await apiFetch(`/api/buyer/addresses/${a.id}`, { method: 'DELETE' });
                    loadData();
                  }}
                  className="text-[#78716C] hover:text-[#DC2626] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
            <Button type="submit" className="w-full">
              {lang === 'ne' ? 'ठेगाना सुरक्षित गर्नुहोस्' : 'Save Address'}
            </Button>
          </form>
        </div>
      )}

      {tab === 'wishlist' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {wishlist.map((w) => (
            <div key={w.id} className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex justify-between items-center">
              <div>
                <p className="font-semibold text-sm text-[#0F172A]">{lang === 'ne' ? w.name_ne : w.name_en}</p>
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? w.store_name_ne : w.store_name_en}</p>
                <p className="text-sm font-bold text-[#B91C1C] tabular-nums mt-1">
                  {formatNPR(w.discount_price_npr || w.price_npr, lang)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate(`/product/${w.slug}`)}>
                {lang === 'ne' ? 'हेर्नुहोस्' : 'View'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
