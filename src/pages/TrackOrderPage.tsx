import { useEffect, useState } from 'react';
import { Printer, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';

interface TrackedOrderPayload {
  order: {
    order_number: string;
    invoice_number: string;
    status: string;
    payment_method: string;
    payment_status: string;
    customer_name: string;
    customer_phone: string;
    delivery_mode: string;
    delivery_district: string;
    delivery_address: string;
    subtotal_npr: number;
    discount_npr: number;
    delivery_fee_npr: number;
    total_npr: number;
    store_name_ne: string;
    store_name_en: string;
    cooperative_name_ne: string;
    cooperative_name_en: string;
    cooperative_phone: string;
    created_at: string;
  };
  items: Array<{
    id: string;
    product_name_ne: string;
    product_name_en: string;
    sku: string;
    unit_label: string;
    unit_price_npr: number;
    quantity: number;
    line_total_npr: number;
  }>;
  history: Array<{ id: string; to_status: string; note: string; created_at: string }>;
}

export function TrackOrderPage() {
  const { lang } = useApp();
  const params = new URLSearchParams(window.location.search);
  const [orderNumber, setOrderNumber] = useState(params.get('orderNumber') || '');
  const [token, setToken] = useState(params.get('token') || '');
  const [data, setData] = useState<TrackedOrderPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const performLookup = async (num = orderNumber, tok = token) => {
    if (!num.trim() || !tok.trim()) return;
    setLoading(true);
    setError('');
    const res = await apiFetch<TrackedOrderPayload>(
      `/api/orders/track?orderNumber=${encodeURIComponent(num.trim())}&token=${encodeURIComponent(tok.trim())}`
    );
    setLoading(false);
    if (res.ok) setData(res.data);
    else {
      setData(null);
      setError(res.error || 'अर्डर फेला परेन।');
    }
  };

  useEffect(() => {
    if (params.get('orderNumber') && params.get('token')) {
      performLookup(params.get('orderNumber')!, params.get('token')!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2 border-b border-[#E5E2DC] pb-4">
        <h1 className="font-display text-3xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'सुरक्षित अर्डर ट्र्याकिङ र बिल' : 'Secure Guest Order Tracking & Invoice'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {lang === 'ne'
            ? 'अर्डर नम्बर र अर्डर पुष्टि टोकन प्रविष्ट गरी प्रत्यक्ष स्थिति हेर्नुहोस्।'
            : 'Enter your Order Number and unguessable access token to view fulfillment status and invoice.'}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          performLookup();
        }}
        className="bg-white border border-[#E5E2DC] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-3"
      >
        <Input
          required
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="SB-2026-XXXXXX"
          className="font-mono"
        />
        <Input
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={lang === 'ne' ? 'सुरक्षा टोकन' : 'Access Token'}
          className="font-mono"
        />
        <Button type="submit" disabled={loading}>
          <Search className="w-4 h-4" />
          {loading ? (lang === 'ne' ? 'खोज्दै...' : 'Searching...') : lang === 'ne' ? 'ट्र्याक गर्नुहोस्' : 'Track Order'}
        </Button>
      </form>

      {error && <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-[#B91C1C]">{error}</div>}

      {data && (
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E2DC] pb-4">
            <div>
              <p className="text-xs font-mono text-[#78716C]">
                {data.order.order_number} · {data.order.invoice_number}
              </p>
              <h2 className="text-xl font-bold text-[#0F172A] mt-1">
                {lang === 'ne' ? data.order.store_name_ne : data.order.store_name_en}
              </h2>
              <p className="text-xs text-[#57534E]">{formatDateBS(data.order.created_at, lang)}</p>
            </div>

            <div className="text-right space-y-1">
              <p className="text-sm font-bold text-[#15803D]">{labelFor(STATUS_LABELS, data.order.status, lang)}</p>
              <p className="text-xs text-[#57534E]">
                {lang === 'ne' ? 'भुक्तानी:' : 'Payment:'} {labelFor(STATUS_LABELS, data.order.payment_status, lang)}
              </p>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                <Printer className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'बिल प्रिन्ट' : 'Print Invoice'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#57534E]">
            <div>
              <p className="font-semibold text-[#0F172A] mb-1">{lang === 'ne' ? 'ग्राहक विवरण' : 'Customer'}</p>
              <p>{data.order.customer_name}</p>
              <p className="tabular-nums">{data.order.customer_phone}</p>
              <p>
                {data.order.delivery_mode === 'pickup'
                  ? lang === 'ne'
                    ? 'पसलबाट पिकअप'
                    : 'Store Pickup'
                  : `${data.order.delivery_address}, ${data.order.delivery_district}`}
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#0F172A] mb-1">{lang === 'ne' ? 'सहकारी सम्पर्क' : 'Cooperative Contact'}</p>
              <p>{lang === 'ne' ? data.order.cooperative_name_ne : data.order.cooperative_name_en}</p>
              <p className="tabular-nums">{data.order.cooperative_phone}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E2DC] text-left text-xs text-[#78716C]">
                  <th className="py-2">{lang === 'ne' ? 'उत्पादन' : 'Product'}</th>
                  <th className="py-2 text-right">{lang === 'ne' ? 'दर' : 'Rate'}</th>
                  <th className="py-2 text-right">{lang === 'ne' ? 'परिमाण' : 'Qty'}</th>
                  <th className="py-2 text-right">{lang === 'ne' ? 'रकम' : 'Amount'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F1EC]">
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5">
                      <p className="font-medium text-[#0F172A]">
                        {lang === 'ne' ? item.product_name_ne : item.product_name_en}
                      </p>
                      <p className="text-xs font-mono text-[#78716C]">{item.sku}</p>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{formatNPR(item.unit_price_npr, lang)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {lang === 'ne' ? toNepaliDigits(item.quantity) : item.quantity}
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums">
                      {formatNPR(item.line_total_npr, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#E5E2DC] pt-4 space-y-1 text-sm tabular-nums max-w-xs ml-auto">
            <div className="flex justify-between text-[#57534E]">
              <span>{lang === 'ne' ? 'उप-जम्मा' : 'Subtotal'}</span>
              <span>{formatNPR(data.order.subtotal_npr, lang)}</span>
            </div>
            {data.order.discount_npr > 0 && (
              <div className="flex justify-between text-[#15803D]">
                <span>{lang === 'ne' ? 'छुट' : 'Discount'}</span>
                <span>-{formatNPR(data.order.discount_npr, lang)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#57534E]">
              <span>{lang === 'ne' ? 'डेलिभरी' : 'Delivery'}</span>
              <span>{formatNPR(data.order.delivery_fee_npr, lang)}</span>
            </div>
            <div className="flex justify-between font-bold text-base text-[#0F172A] pt-1 border-t border-[#E5E2DC]">
              <span>{lang === 'ne' ? 'कुल जम्मा' : 'Total'}</span>
              <span>{formatNPR(data.order.total_npr, lang)}</span>
            </div>
          </div>

          <div className="border-t border-[#E5E2DC] pt-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#0F172A]">
              {lang === 'ne' ? 'अर्डर प्रगति विवरण' : 'Status Timeline'}
            </h3>
            <div className="space-y-1.5 text-xs">
              {data.history.map((h) => (
                <div key={h.id} className="flex justify-between text-[#57534E]">
                  <span className="font-medium text-[#0F172A]">{labelFor(STATUS_LABELS, h.to_status, lang)}</span>
                  <span className="tabular-nums">{formatDateBS(h.created_at, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
