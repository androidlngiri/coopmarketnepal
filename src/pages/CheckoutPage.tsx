import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, MapPin, Printer, ShieldCheck, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatNPR, NEPAL_PROVINCES, toNepaliDigits } from '../lib/bs-date';
import { Input, Select, Textarea } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

interface ValidatedGroup {
  cooperative: {
    id: string;
    slug: string;
    store_name_ne: string;
    store_name_en: string;
  };
  deliveryConfig?: {
    pickup_enabled: number;
    pickup_address_ne?: string;
    bank_payment_instructions_ne?: string;
    free_delivery_threshold_npr?: number;
  };
  items: Array<{
    product: { id: string; name_ne: string; name_en: string; unit_label_ne: string };
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  promoCode: string | null;
  promoApplied?: boolean;
  promoError?: string | null;
  deliveryMode: 'delivery' | 'pickup';
}

interface CreatedOrderSummary {
  id: string;
  orderNumber: string;
  invoiceNumber: string;
  guestAccessToken: string;
  cooperativeNameNe: string;
  cooperativeNameEn: string;
  totalNpr: number;
  paymentMethod: string;
}

interface SavedAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  province: string;
  district: string;
  municipality: string;
  ward_number: string;
  street_address: string;
}

export function CheckoutPage() {
  const { lang, cart, clearCart, user, navigate } = useApp();
  const [groups, setGroups] = useState<ValidatedGroup[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [coopOptions, setCoopOptions] = useState<
    Record<string, { deliveryMode: 'delivery' | 'pickup'; promoCode: string }>
  >({});
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);

  const [customerName, setCustomerName] = useState(user?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [province, setProvince] = useState('बागमती प्रदेश');
  const [district, setDistrict] = useState('काठमाडौँ');
  const [municipality, setMunicipality] = useState('');
  const [ward, setWard] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentReference, setPaymentReference] = useState('');
  const [requireOtp, setRequireOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpNotice, setOtpNotice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [confirmedOrders, setConfirmedOrders] = useState<CreatedOrderSummary[] | null>(null);

  const idempotencyKey = useMemo(() => `idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, []);
  const districts = NEPAL_PROVINCES[province]?.districts || [];

  useEffect(() => {
    if (user) {
      if (!customerName && user.full_name) setCustomerName(user.full_name);
      if (!customerPhone && user.phone) setCustomerPhone(user.phone);
      if (!customerEmail && user.email) setCustomerEmail(user.email);
      apiFetch<{ addresses: SavedAddress[] }>('/api/buyer/addresses').then((res) => {
        if (res.ok) setSavedAddresses(res.data.addresses || []);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const applySavedAddress = (a: SavedAddress) => {
    setCustomerName(a.recipient_name || customerName);
    setCustomerPhone(a.phone || customerPhone);
    if (NEPAL_PROVINCES[a.province]) {
      setProvince(a.province);
    }
    setDistrict(a.district);
    setMunicipality(a.municipality);
    setWard(a.ward_number);
    setAddress(a.street_address);
    toast.success(lang === 'ne' ? `"${a.label}" ठेगाना भरियो।` : `Filled "${a.label}" address.`);
  };

  const revalidate = async (nextOptions = coopOptions) => {
    if (cart.length === 0) return;
    setValidating(true);
    setValidationError('');
    const res = await apiFetch<{ groups: ValidatedGroup[]; grandTotal: number }>('/api/checkout/validate-cart', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        coopOptions: nextOptions,
      }),
    });
    setValidating(false);
    if (res.ok) {
      setGroups(res.data.groups);
      setGrandTotal(res.data.grandTotal);
    } else {
      setValidationError(res.error || 'कार्ट प्रमाणीकरण असफल भयो।');
    }
  };

  useEffect(() => {
    revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length]);

  const sendCheckoutOtp = async () => {
    if (!customerPhone.trim()) {
      toast.error(lang === 'ne' ? 'पहिले मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' : 'Enter mobile number first.');
      return;
    }
    setOtpSending(true);
    setOtpNotice('');
    const res = await apiFetch<{ localOtpNotice?: string }>('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: customerPhone, purpose: 'guest_checkout' }),
    });
    setOtpSending(false);
    if (!res.ok) {
      toast.error(res.error || 'OTP पठाउन सकिएन।');
      return;
    }
    if (res.data.localOtpNotice) setOtpNotice(res.data.localOtpNotice);
    else toast.success(lang === 'ne' ? 'OTP पठाइयो।' : 'OTP sent.');
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlacing(true);
    const res = await apiFetch<{ orders: CreatedOrderSummary[] }>('/api/checkout/place-order', {
      method: 'POST',
      body: JSON.stringify({
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        coopOptions,
        customerName,
        customerPhone,
        customerEmail,
        deliveryProvince: province,
        deliveryDistrict: district,
        deliveryMunicipality: municipality,
        deliveryWard: ward,
        deliveryAddress: address,
        deliveryNote: note,
        paymentMethod,
        paymentReference,
        requireOtp,
        otpCode,
        idempotencyKey,
      }),
    });
    setPlacing(false);
    if (!res.ok) {
      toast.error(res.error || 'अर्डर पेश गर्न सकिएन।');
      return;
    }
    setConfirmedOrders(res.data.orders);
    clearCart();
    toast.success(lang === 'ne' ? 'अर्डर सफलतापूर्वक पुष्टि भयो!' : 'Orders confirmed!');
  };

  if (confirmedOrders) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[#15803D]">
              <CheckCircle2 className="w-7 h-7" />
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0F172A]">
                  {lang === 'ne' ? 'तपाईंको अर्डर पुष्टि भयो!' : 'Order Confirmed!'}
                </h1>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? `प्रत्येक सहकारीको लागि छुट्टाछुट्टै ${toNepaliDigits(confirmedOrders.length)} अर्डर सिर्जना गरिएको छ।`
                    : `${confirmedOrders.length} cooperative order(s) created from your cart.`}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="w-3.5 h-3.5" />
              {lang === 'ne' ? 'प्रिन्ट' : 'Print'}
            </Button>
          </div>

          <div className="space-y-3">
            {confirmedOrders.map((o) => (
              <div key={o.id} className="p-4 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6] space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-[#0F172A]">
                      {lang === 'ne' ? o.cooperativeNameNe : o.cooperativeNameEn}
                    </p>
                    <p className="text-xs font-mono text-[#57534E]">
                      {o.orderNumber} · {o.invoiceNumber}
                    </p>
                  </div>
                  <span className="font-bold text-sm text-[#0F172A] tabular-nums">{formatNPR(o.totalNpr, lang)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E2DC] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#78716C] truncate max-w-[200px]">
                      Token: {o.guestAccessToken}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(o.guestAccessToken);
                        toast.success(lang === 'ne' ? 'टोकन कपी भयो।' : 'Token copied.');
                      }}
                      className="text-[#0F172A] hover:text-[#B91C1C] inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      {lang === 'ne' ? 'कपी' : 'Copy'}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/track-order?orderNumber=${o.orderNumber}&token=${o.guestAccessToken}`)}
                  >
                    {lang === 'ne' ? 'अर्डर र बिल ट्र्याक गर्नुहोस्' : 'Track Order & Invoice'}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => navigate('/marketplace')}>
              {lang === 'ne' ? 'बजारमा फर्कनुहोस्' : 'Continue Shopping'}
            </Button>
            {user && (
              <Button variant="outline" onClick={() => navigate('/account')}>
                {lang === 'ne' ? 'मेरो अर्डरहरू हेर्नुहोस्' : 'View My Orders'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'तपाईंको कार्ट खाली छ' : 'Your Cart is Empty'}
        </h1>
        <Button onClick={() => navigate('/marketplace')}>
          {lang === 'ne' ? 'उत्पादनहरू हेर्नुहोस्' : 'Explore Marketplace'}
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="font-display text-3xl font-bold text-[#0F172A] mb-6">
        {lang === 'ne' ? 'एकीकृत बहु-सहकारी चेकआउट' : 'Unified Multi-Cooperative Checkout'}
      </h1>

      {validationError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#B91C1C]">
          {validationError}
        </div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Buyer & Delivery Details */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-base text-[#0F172A]">
              {lang === 'ne' ? '१. ग्राहक तथा डेलिभरी ठेगाना' : '1. Buyer & Delivery Details'}
            </h2>
            <p className="text-xs text-[#57534E]">
              {lang === 'ne'
                ? 'दर्ता अनिवार्य छैन — अतिथिको रूपमा सीधै अर्डर गर्न सक्नुहुन्छ।'
                : 'Guest checkout supported — no registration required.'}
            </p>

            {savedAddresses.length > 0 && (
              <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] space-y-2">
                <p className="text-xs font-medium text-[#0F172A] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#B91C1C]" />
                  {lang === 'ne' ? 'सुरक्षित ठेगानाबाट भर्नुहोस्:' : 'Quick-fill from saved addresses:'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedAddresses.map((a) => (
                    <Button key={a.id} type="button" size="sm" variant="outline" onClick={() => applySavedAddress(a)}>
                      {a.label} · {a.district}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पूरा नाम *' : 'Full Name *'}</label>
                <Input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? 'मोबाइल नम्बर (98XXXXXXXX) *' : 'Mobile Number *'}
                </label>
                <Input
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="98XXXXXXXX"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'प्रदेश *' : 'Province *'}</label>
                <Select
                  value={province}
                  onChange={(e) => {
                    const p = e.target.value;
                    setProvince(p);
                    setDistrict(NEPAL_PROVINCES[p]?.districts[0] || '');
                  }}
                >
                  {Object.entries(NEPAL_PROVINCES).map(([k, p]) => (
                    <option key={k} value={k}>
                      {lang === 'ne' ? p.ne : p.en}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'जिल्ला *' : 'District *'}</label>
                <Select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? 'नगरपालिका / गा.पा.' : 'Municipality'}
                </label>
                <Input value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'वडा नं.' : 'Ward'}</label>
                <Input value={ward} onChange={(e) => setWard(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'इमेल (ऐच्छिक)' : 'Email (Optional)'}</label>
                <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'विस्तृत ठेगाना (टोल/चोक) *' : 'Street / Landmark Address *'}
              </label>
              <Input required value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'डेलिभरी निर्देशन (ऐच्छिक)' : 'Delivery Note (Optional)'}
              </label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            {/* Optional Mobile OTP verification */}
            <div className="pt-2 border-t border-[#E5E2DC] space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireOtp}
                  onChange={(e) => setRequireOtp(e.target.checked)}
                />
                <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                <span>
                  {lang === 'ne' ? 'मोबाइल OTP मार्फत अर्डर प्रमाणित गर्नुहोस् (ऐच्छिक)' : 'Verify order via Mobile OTP (Optional)'}
                </span>
              </label>
              {requireOtp && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="6-digit OTP"
                      className="max-w-[160px] font-mono"
                    />
                    <Button type="button" variant="outline" size="sm" disabled={otpSending} onClick={sendCheckoutOtp}>
                      {otpSending
                        ? lang === 'ne'
                          ? 'पठाउँदै...'
                          : 'Sending...'
                        : lang === 'ne'
                        ? 'OTP पठाउनुहोस्'
                        : 'Send OTP'}
                    </Button>
                  </div>
                  {otpNotice && <p className="text-xs text-[#B91C1C] font-mono">{otpNotice}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-base text-[#0F172A]">
              {lang === 'ne' ? '२. भुक्तानी विधि छान्नुहोस्' : '2. Payment Method'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'cod', ne: 'डेलिभरीमा नगद (COD)', en: 'Cash on Delivery' },
                { id: 'bank_transfer', ne: 'बैंक ट्रान्सफर (म्यानुअल)', en: 'Manual Bank Transfer' },
                { id: 'qr_manual', ne: 'QR भुक्तानी (प्रमाणित)', en: 'Manual QR Payment' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-3 rounded-lg border text-left text-xs font-medium cursor-pointer ${
                    paymentMethod === m.id
                      ? 'border-[#B91C1C] bg-red-50/50 text-[#0F172A]'
                      : 'border-[#E5E2DC] bg-white text-[#57534E]'
                  }`}
                >
                  {lang === 'ne' ? m.ne : m.en}
                </button>
              ))}
            </div>

            {(paymentMethod === 'bank_transfer' || paymentMethod === 'qr_manual') && (
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-medium">
                  {lang === 'ne'
                    ? 'भुक्तानी भौचर / ट्रान्जेक्सन रिफरेन्स नम्बर (सहकारीले सर्भरबाट प्रमाणित गर्नेछ)'
                    : 'Payment Reference / Voucher ID (verified server-side by cooperative)'}
                </label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="TXN-2083-XXXX"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Multi-Cooperative Order Splitting Summary */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-24">
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base text-[#0F172A]">
                {lang === 'ne' ? 'सहकारी अनुसार अर्डर विभाजन' : 'Order Split by Cooperative'}
              </h2>
              <span className="text-xs text-[#57534E] tabular-nums">
                {lang === 'ne' ? `${toNepaliDigits(groups.length)} अर्डर` : `${groups.length} order(s)`}
              </span>
            </div>

            {validating ? (
              <div className="h-32 bg-[#F3F1EC] rounded-lg animate-pulse" />
            ) : (
              <div className="space-y-5">
                {groups.map((g) => {
                  const opt = coopOptions[g.cooperative.id] || { deliveryMode: 'delivery', promoCode: '' };
                  return (
                    <div key={g.cooperative.id} className="p-4 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6] space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm text-[#0F172A]">
                          {lang === 'ne' ? g.cooperative.store_name_ne : g.cooperative.store_name_en}
                        </p>
                        {g.deliveryConfig?.pickup_enabled ? (
                          <select
                            value={opt.deliveryMode}
                            onChange={(e) => {
                              const next = {
                                ...coopOptions,
                                [g.cooperative.id]: { ...opt, deliveryMode: e.target.value as 'delivery' | 'pickup' },
                              };
                              setCoopOptions(next);
                              revalidate(next);
                            }}
                            className="text-xs border border-[#E5E2DC] rounded px-2 py-1 bg-white"
                          >
                            <option value="delivery">{lang === 'ne' ? 'डेलिभरी' : 'Delivery'}</option>
                            <option value="pickup">{lang === 'ne' ? 'पसलबाट पिकअप' : 'Store Pickup'}</option>
                          </select>
                        ) : (
                          <span className="text-xs text-[#57534E] inline-flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5" /> {lang === 'ne' ? 'डेलिभरी' : 'Delivery'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 text-xs">
                        {g.items.map((item) => (
                          <div key={item.product.id} className="flex justify-between gap-2">
                            <span className="text-[#57534E]">
                              {lang === 'ne' ? item.product.name_ne : item.product.name_en} ×{' '}
                              {lang === 'ne' ? toNepaliDigits(item.quantity) : item.quantity}
                            </span>
                            <span className="tabular-nums font-medium">{formatNPR(item.lineTotal, lang)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Coupon per cooperative */}
                      <div className="space-y-1 pt-1">
                        <div className="flex gap-2">
                          <Input
                            value={opt.promoCode}
                            onChange={(e) =>
                              setCoopOptions({
                                ...coopOptions,
                                [g.cooperative.id]: { ...opt, promoCode: e.target.value },
                              })
                            }
                            placeholder={lang === 'ne' ? 'कूपन कोड' : 'Promo code'}
                            className="h-8 text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={validating}
                            onClick={() => revalidate(coopOptions)}
                          >
                            {lang === 'ne' ? 'लागू' : 'Apply'}
                          </Button>
                        </div>
                        {g.promoApplied && g.promoCode && (
                          <p className="text-[11px] text-[#15803D] font-medium">
                            {lang === 'ne' ? `कूपन "${g.promoCode}" लागू भयो।` : `Promo "${g.promoCode}" applied.`}
                          </p>
                        )}
                        {g.promoError && <p className="text-[11px] text-[#DC2626]">{g.promoError}</p>}
                      </div>

                      {paymentMethod === 'bank_transfer' && g.deliveryConfig?.bank_payment_instructions_ne && (
                        <p className="text-xs text-[#57534E] bg-white p-2 rounded border border-[#E5E2DC]">
                          {g.deliveryConfig.bank_payment_instructions_ne}
                        </p>
                      )}

                      <div className="pt-2 border-t border-[#E5E2DC] space-y-1 text-xs tabular-nums">
                        <div className="flex justify-between text-[#57534E]">
                          <span>{lang === 'ne' ? 'उप-जम्मा' : 'Subtotal'}</span>
                          <span>{formatNPR(g.subtotal, lang)}</span>
                        </div>
                        {g.discount > 0 && (
                          <div className="flex justify-between text-[#15803D]">
                            <span>{lang === 'ne' ? 'छुट' : 'Discount'}</span>
                            <span>-{formatNPR(g.discount, lang)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-[#57534E]">
                          <span>{lang === 'ne' ? 'डेलिभरी शुल्क' : 'Delivery Fee'}</span>
                          <span>{g.deliveryFee === 0 ? (lang === 'ne' ? 'निःशुल्क' : 'Free') : formatNPR(g.deliveryFee, lang)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-[#0F172A] pt-1">
                          <span>{lang === 'ne' ? 'सहकारी जम्मा' : 'Order Total'}</span>
                          <span>{formatNPR(g.total, lang)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-[#E5E2DC] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#0F172A]">{lang === 'ne' ? 'कुल जम्मा' : 'Grand Total'}</span>
              <span className="text-xl font-bold text-[#B91C1C] tabular-nums">{formatNPR(grandTotal, lang)}</span>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={placing || validating || !!validationError}>
              {placing
                ? lang === 'ne'
                  ? 'अर्डर प्रक्रिया हुँदैछ...'
                  : 'Placing Order...'
                : lang === 'ne'
                ? 'अर्डर पुष्टि गर्नुहोस्'
                : 'Confirm & Place Order'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

