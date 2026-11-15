import { useEffect, useState } from 'react';
import { Activity, Building2, CreditCard, Eye, Globe, LayoutDashboard, ShieldCheck, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

type AdminTab = 'overview' | 'cooperatives' | 'plans' | 'marketplace' | 'users' | 'logs';

export function SuperAdminDashboardPage() {
  const { lang, user, navigate } = useApp();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [cooperatives, setCooperatives] = useState<Array<Record<string, unknown>>>([]);
  const [plansData, setPlansData] = useState<{
    plans: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  }>({ plans: [], payments: [] });
  const [newPlan, setNewPlan] = useState({
    code: '',
    nameNe: '',
    nameEn: '',
    monthlyPriceNpr: '1500',
    annualPriceNpr: '15000',
    maxProducts: '100',
    maxStaff: '5',
  });
  const [marketCtrl, setMarketCtrl] = useState<{
    categories: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
    branding: Record<string, unknown>;
  }>({ categories: [], products: [], branding: {} });
  const [newCat, setNewCat] = useState({ nameNe: '', nameEn: '' });
  const [productFilter, setProductFilter] = useState('');
  const [usersList, setUsersList] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<{
    auditLogs: Array<Record<string, unknown>>;
    loginActivities: Array<Record<string, unknown>>;
    smsLogs: Array<Record<string, unknown>>;
    tickets: Array<Record<string, unknown>>;
    smsConfigured: boolean;
  }>({ auditLogs: [], loginActivities: [], smsLogs: [], tickets: [], smsConfigured: false });

  const loadTab = async (active: AdminTab) => {
    if (active === 'overview') {
      const r = await apiFetch<Record<string, unknown>>('/api/admin/overview');
      if (r.ok) setOverview(r.data);
    } else if (active === 'cooperatives') {
      const r = await apiFetch<{ cooperatives: Array<Record<string, unknown>> }>('/api/admin/cooperatives');
      if (r.ok) setCooperatives(r.data.cooperatives);
    } else if (active === 'plans') {
      const r = await apiFetch<typeof plansData>('/api/admin/plans');
      if (r.ok) setPlansData(r.data);
    } else if (active === 'marketplace') {
      const r = await apiFetch<typeof marketCtrl>('/api/admin/marketplace-controls');
      if (r.ok) setMarketCtrl(r.data);
    } else if (active === 'users') {
      const r = await apiFetch<{ users: Array<Record<string, unknown>> }>('/api/admin/users');
      if (r.ok) setUsersList(r.data.users);
    } else if (active === 'logs') {
      const r = await apiFetch<typeof logs>('/api/admin/logs');
      if (r.ok) setLogs(r.data);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 mx-auto text-[#B91C1C]" />
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'सुपर एडमिन नियन्त्रण कक्ष' : 'SaaS Super-Admin Control Panel'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {lang === 'ne'
            ? 'यो क्षेत्रमा प्रवेश गर्न सर्भर-प्रमाणित सुपर एडमिन अधिकार आवश्यक छ।'
            : 'Server-verified Super-Admin authorization is required.'}
        </p>
        <Button onClick={() => navigate('/login')}>{lang === 'ne' ? 'सुपर एडमिन लगइन' : 'Sign In'}</Button>
      </div>
    );
  }

  const coopCounts = (overview?.coopCounts as Record<string, number>) || {};
  const subCounts = (overview?.subCounts as Record<string, number>) || {};
  const mStats = (overview?.marketplaceStats as Record<string, number>) || {};

  const navItems: Array<{ id: AdminTab; ne: string; en: string; icon: React.ReactNode }> = [
    { id: 'overview', ne: 'प्लेटफर्म अवलोकन', en: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'cooperatives', ne: 'सहकारी स्वीकृति र प्रशासन', en: 'Cooperatives', icon: <Building2 className="w-4 h-4" /> },
    { id: 'plans', ne: 'सदस्यता योजना र भुक्तानी', en: 'Subscriptions', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'marketplace', ne: 'प्लेटफर्म र अनुगमन', en: 'Platform & Monitor', icon: <Globe className="w-4 h-4" /> },
    { id: 'users', ne: 'प्रयोगकर्ता व्यवस्थापन', en: 'Users & Roles', icon: <Users className="w-4 h-4" /> },
    { id: 'logs', ne: 'अडिट, SMS र सहायता', en: 'Logs & Support', icon: <Activity className="w-4 h-4" /> },
  ];

  const handleDecision = async (coopId: string, status: string, reason = '') => {
    const res = await apiFetch(`/api/admin/cooperatives/${coopId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) return toast.error(res.error || 'कार्य असफल भयो।');
    toast.success(lang === 'ne' ? `सहकारी स्थिति "${status}" मा अद्यावधिक भयो।` : `Cooperative marked ${status}`);
    loadTab('cooperatives');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <aside className="lg:col-span-3 bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-4">
        <div className="pb-3 border-b border-[#E5E2DC]">
          <p className="text-xs text-[#B91C1C] font-semibold">SaaS Super Admin</p>
          <p className="font-semibold text-sm text-[#0F172A]">{user.full_name}</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                tab === item.id ? 'bg-[#0F172A] text-white' : 'text-[#57534E] hover:bg-[#F3F1EC]'
              }`}
            >
              {item.icon}
              <span>{lang === 'ne' ? item.ne : item.en}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'जम्मा सहकारी' : 'Total Cooperatives'}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(coopCounts.total || 0) : coopCounts.total || 0}
                </p>
                <p className="text-xs text-[#15803D] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `स्वीकृत: ${toNepaliDigits(coopCounts.approved || 0)} · प्रतीक्षारत: ${toNepaliDigits(coopCounts.pending || 0)}`
                    : `Approved: ${coopCounts.approved || 0} · Pending: ${coopCounts.pending || 0}`}
                </p>
              </div>

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'बजार कारोबार (GMV)' : 'Marketplace GMV'}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{formatNPR(mStats.gmv_npr || 0, lang)}</p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `अर्डर: ${toNepaliDigits(mStats.total_orders || 0)} (अतिथि: ${toNepaliDigits(mStats.guest_orders || 0)})`
                    : `Orders: ${mStats.total_orders || 0} (Guest: ${mStats.guest_orders || 0})`}
                </p>
              </div>

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'मासिक आवर्ती राजस्व (MRR)' : 'Monthly Recurring Revenue'}</p>
                <p className="text-xl font-bold text-[#15803D] tabular-nums mt-1">
                  {formatNPR(Number(overview?.mrrNpr || 0), lang)}
                </p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `सक्रिय सदस्यता: ${toNepaliDigits(subCounts.active_subs || 0)}`
                    : `Active Subs: ${subCounts.active_subs || 0}`}
                </p>
              </div>

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'कुल उत्पादन र क्रेता' : 'Products & Buyers'}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(mStats.total_products || 0) : mStats.total_products || 0}
                </p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `दर्ता क्रेता: ${toNepaliDigits(mStats.registered_buyers || 0)}`
                    : `Buyers: ${mStats.registered_buyers || 0}`}
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">{lang === 'ne' ? 'हालैका प्रशासनिक गतिविधि' : 'Recent Platform Audit Activity'}</h2>
                <span className="text-xs text-[#57534E]">
                  Akash SMS: {overview?.smsConfigured ? 'Configured' : 'Unconfigured (Env Key Required)'}
                </span>
              </div>
              <div className="divide-y divide-[#F3F1EC] text-xs">
                {((overview?.recentAudits as Array<Record<string, unknown>>) || []).map((a) => (
                  <div key={String(a.id)} className="py-2.5 flex justify-between gap-2">
                    <span>
                      <strong className="font-mono">{String(a.action)}</strong> · {String(a.entity_type)} ({String(a.actor_name || 'System')})
                    </span>
                    <span className="text-[#78716C] tabular-nums">{formatDateBS(String(a.created_at), lang)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* COOPERATIVES ADMIN */}
        {tab === 'cooperatives' && (
          <div className="space-y-4">
            {cooperatives.map((c) => (
              <div key={String(c.id)} className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono text-[#78716C]">
                      {String(c.registration_number)} · {String(c.district)}, {String(c.province)}
                    </p>
                    <h3 className="text-base font-bold text-[#0F172A]">
                      {lang === 'ne' ? String(c.name_ne) : String(c.name_en)}
                    </h3>
                    <p className="text-xs text-[#57534E]">
                      Rep: {String(c.authorized_rep_name)} ({String(c.authorized_rep_designation)}) · {String(c.contact_phone)}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <span className="text-xs font-bold text-[#B91C1C]">
                      {labelFor(STATUS_LABELS, String(c.status), lang)}
                    </span>
                    <p className="text-xs text-[#57534E]">
                      {c.plan_name_en ? `Plan: ${String(c.plan_name_en)}` : 'No active plan'}
                    </p>
                  </div>
                </div>

                {/* Documents */}
                {((c.documents as Array<Record<string, unknown>>) || []).length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {((c.documents as Array<Record<string, unknown>>) || []).map((d) => (
                      <a
                        key={String(d.id)}
                        href={String(d.file_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded border border-[#E5E2DC] bg-[#FAF9F6] hover:underline"
                      >
                        {String(d.file_name)} ({String(d.verified_status)})
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F3F1EC]">
                  {c.status !== 'approved' && (
                    <Button size="sm" onClick={() => handleDecision(String(c.id), 'approved', 'Documents verified')}>
                      {lang === 'ne' ? 'स्वीकृत गर्नुहोस्' : 'Approve & Activate Trial'}
                    </Button>
                  )}
                  {c.status === 'pending_review' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecision(String(c.id), 'rejected', 'Incomplete registration documents')}
                    >
                      {lang === 'ne' ? 'अस्वीकृत' : 'Reject'}
                    </Button>
                  )}
                  {c.status === 'approved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecision(String(c.id), 'suspended', 'Suspended by Super Admin')}
                    >
                      {lang === 'ne' ? 'निलम्बन गर्नुहोस्' : 'Suspend'}
                    </Button>
                  )}
                  {c.status === 'suspended' && (
                    <Button size="sm" variant="outline" onClick={() => handleDecision(String(c.id), 'approved', 'Reactivated')}>
                      {lang === 'ne' ? 'पुनः सक्रिय' : 'Reactivate'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await apiFetch(`/api/admin/cooperatives/${c.id}/featured`, {
                        method: 'PATCH',
                        body: JSON.stringify({ isFeatured: !c.is_featured }),
                      });
                      loadTab('cooperatives');
                    }}
                  >
                    {c.is_featured
                      ? lang === 'ne'
                        ? 'विशेषबाट हटाउनुहोस्'
                        : 'Unfeature'
                      : lang === 'ne'
                      ? 'विशेष पसल बनाउनुहोस्'
                      : 'Feature Store'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PLANS & BILLING */}
        {tab === 'plans' && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await apiFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify(newPlan) });
                if (!r.ok) return toast.error(r.error || 'योजना थप्न सकिएन');
                toast.success(lang === 'ne' ? 'नयाँ सदस्यता योजना थपियो' : 'Plan created');
                loadTab('plans');
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h2 className="font-semibold text-base">{lang === 'ne' ? 'नयाँ सदस्यता योजना थप्नुहोस्' : 'Create Configurable Plan'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  required
                  placeholder="Code (e.g. district_union)"
                  value={newPlan.code}
                  onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })}
                />
                <Input
                  required
                  placeholder={lang === 'ne' ? 'नेपाली नाम' : 'Nepali Name'}
                  value={newPlan.nameNe}
                  onChange={(e) => setNewPlan({ ...newPlan, nameNe: e.target.value })}
                />
                <Input
                  required
                  placeholder="English Name"
                  value={newPlan.nameEn}
                  onChange={(e) => setNewPlan({ ...newPlan, nameEn: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input
                  type="number"
                  placeholder="Monthly NPR"
                  value={newPlan.monthlyPriceNpr}
                  onChange={(e) => setNewPlan({ ...newPlan, monthlyPriceNpr: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Annual NPR"
                  value={newPlan.annualPriceNpr}
                  onChange={(e) => setNewPlan({ ...newPlan, annualPriceNpr: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Max Products"
                  value={newPlan.maxProducts}
                  onChange={(e) => setNewPlan({ ...newPlan, maxProducts: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Max Staff"
                  value={newPlan.maxStaff}
                  onChange={(e) => setNewPlan({ ...newPlan, maxStaff: e.target.value })}
                />
              </div>
              <Button type="submit">{lang === 'ne' ? 'योजना सुरक्षित गर्नुहोस्' : 'Create Plan'}</Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm">{lang === 'ne' ? 'सदस्यता भुक्तानी प्रमाणीकरण' : 'Subscription Payment Verification'}</h3>
              {plansData.payments.length === 0 ? (
                <p className="text-xs text-[#78716C]">{lang === 'ne' ? 'कुनै म्यानुअल भुक्तानी अनुरोध छैन।' : 'No pending payments.'}</p>
              ) : (
                plansData.payments.map((pay) => (
                  <div key={String(pay.id)} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#F3F1EC] text-xs">
                    <span>
                      <strong>{lang === 'ne' ? String(pay.cooperative_name_ne) : String(pay.cooperative_name_en)}</strong> —{' '}
                      {String(pay.plan_name_en)} ({formatNPR(Number(pay.amount_npr), lang)}) · Ref: {String(pay.reference_number)}
                    </span>
                    {pay.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={async () => {
                            await apiFetch(`/api/admin/subscription-payments/${pay.id}/verify`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'verified' }),
                            });
                            loadTab('plans');
                          }}
                        >
                          {lang === 'ne' ? 'प्रमाणित र सक्रिय' : 'Verify & Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await apiFetch(`/api/admin/subscription-payments/${pay.id}/verify`, {
                              method: 'POST',
                              body: JSON.stringify({ decision: 'rejected' }),
                            });
                            loadTab('plans');
                          }}
                        >
                          {lang === 'ne' ? 'अस्वीकृत' : 'Reject'}
                        </Button>
                      </div>
                    ) : (
                      <span className="font-semibold">{labelFor(STATUS_LABELS, String(pay.status), lang)}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MARKETPLACE CONTROLS */}
        {tab === 'marketplace' && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiFetch('/api/admin/settings/branding', {
                  method: 'PUT',
                  body: JSON.stringify(marketCtrl.branding),
                });
                toast.success(lang === 'ne' ? 'प्लेटफर्म सेटिङ सुरक्षित भयो' : 'Branding & announcements saved');
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h2 className="font-semibold text-sm">{lang === 'ne' ? 'प्लेटफर्म घोषणा तथा ब्रान्डिङ' : 'Platform Announcement Banner'}</h2>
              <Input
                placeholder="Nepali Announcement"
                value={String(marketCtrl.branding.announcement_ne || '')}
                onChange={(e) =>
                  setMarketCtrl({ ...marketCtrl, branding: { ...marketCtrl.branding, announcement_ne: e.target.value } })
                }
              />
              <Input
                placeholder="English Announcement"
                value={String(marketCtrl.branding.announcement_en || '')}
                onChange={(e) =>
                  setMarketCtrl({ ...marketCtrl, branding: { ...marketCtrl.branding, announcement_en: e.target.value } })
                }
              />
              <Button type="submit" size="sm">
                {lang === 'ne' ? 'घोषणा अद्यावधिक' : 'Save Announcement'}
              </Button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(newCat) });
                if (r.ok) {
                  setNewCat({ nameNe: '', nameEn: '' });
                  loadTab('marketplace');
                }
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 flex flex-wrap gap-3"
            >
              <Input
                required
                placeholder={lang === 'ne' ? 'नयाँ वर्ग (नेपाली)' : 'Category (Nepali)'}
                value={newCat.nameNe}
                onChange={(e) => setNewCat({ ...newCat, nameNe: e.target.value })}
                className="flex-1"
              />
              <Input
                required
                placeholder="Category (English)"
                value={newCat.nameEn}
                onChange={(e) => setNewCat({ ...newCat, nameEn: e.target.value })}
                className="flex-1"
              />
              <Button type="submit">{lang === 'ne' ? 'वर्ग थप्नुहोस्' : 'Add Global Category'}</Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#E5E2DC] flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F6]">
                <div className="space-y-1">
                  <h2 className="font-semibold text-sm text-[#0F172A] flex items-center gap-2">
                    <Eye className="w-4 h-4 text-[#57534E]" />
                    {lang === 'ne' ? 'सहकारी उत्पादन अनुगमन (पढ्न मात्र)' : 'Cooperative Products Monitor (Read-Only)'}
                  </h2>
                  <p className="text-xs text-[#57534E]">
                    {lang === 'ne'
                      ? 'उत्पादन थप्ने, सम्पादन, मूल्य निर्धारण, स्टक र उपलब्धताको सम्पूर्ण व्यवस्थापन सम्बन्धित सहकारी पसलले मात्र गर्दछ।'
                      : 'Adding, editing, pricing, stock updates, availability, and product details are managed exclusively by each Cooperative Store.'}
                  </p>
                </div>
                <Input
                  placeholder={lang === 'ne' ? 'उत्पादन, SKU वा सहकारी खोज्नुहोस्...' : 'Filter by product, SKU, or cooperative...'}
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  className="max-w-xs h-9 text-xs bg-white"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E2DC] text-left text-[#78716C]">
                      <th className="p-3">{lang === 'ne' ? 'उत्पादन' : 'Product'}</th>
                      <th className="p-3">{lang === 'ne' ? 'सहकारी पसल' : 'Cooperative Store'}</th>
                      <th className="p-3">{lang === 'ne' ? 'वर्ग' : 'Category'}</th>
                      <th className="p-3 text-right">{lang === 'ne' ? 'मूल्य' : 'Price'}</th>
                      <th className="p-3 text-right">{lang === 'ne' ? 'स्टक' : 'Stock'}</th>
                      <th className="p-3">{lang === 'ne' ? 'उपलब्धता' : 'Availability'}</th>
                      <th className="p-3">{lang === 'ne' ? 'स्थिति' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F1EC]">
                    {marketCtrl.products
                      .filter((p) => {
                        const q = productFilter.trim().toLowerCase();
                        if (!q) return true;
                        return [p.name_ne, p.name_en, p.sku, p.cooperative_name_ne, p.cooperative_name_en]
                          .map((v) => String(v || '').toLowerCase())
                          .some((v) => v.includes(q));
                      })
                      .map((p) => (
                        <tr key={String(p.id)}>
                          <td className="p-3">
                            <p className="font-medium text-[#0F172A]">
                              {lang === 'ne' ? String(p.name_ne) : String(p.name_en)}
                            </p>
                            <p className="font-mono text-[11px] text-[#78716C]">{String(p.sku)}</p>
                          </td>
                          <td className="p-3 text-[#57534E]">
                            {p.cooperative_slug ? (
                              <button
                                type="button"
                                onClick={() => navigate(`/store/${String(p.cooperative_slug)}`)}
                                className="text-left hover:underline text-[#0F172A] font-medium cursor-pointer"
                              >
                                {lang === 'ne' ? String(p.cooperative_name_ne || '') : String(p.cooperative_name_en || '')}
                              </button>
                            ) : (
                              <span>
                                {lang === 'ne' ? String(p.cooperative_name_ne || '') : String(p.cooperative_name_en || '')}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-[#57534E]">
                            {lang === 'ne'
                              ? String(p.category_name_ne || '-')
                              : String(p.category_name_en || '-')}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {p.discount_price_npr ? (
                              <div>
                                <span className="font-semibold text-[#0F172A]">
                                  {formatNPR(Number(p.discount_price_npr), lang)}
                                </span>
                                <span className="block text-[11px] line-through text-[#78716C]">
                                  {formatNPR(Number(p.price_npr), lang)}
                                </span>
                              </div>
                            ) : (
                              formatNPR(Number(p.price_npr), lang)
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums font-medium">
                            {lang === 'ne' ? toNepaliDigits(Number(p.stock_quantity || 0)) : Number(p.stock_quantity || 0)}
                          </td>
                          <td className="p-3 text-[#57534E]">
                            {labelFor(STATUS_LABELS, String(p.availability_status || 'in_stock'), lang)}
                          </td>
                          <td className="p-3 font-medium">
                            {labelFor(STATUS_LABELS, String(p.status || 'draft'), lang)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#E5E2DC] text-left text-[#78716C]">
                  <th className="p-3">{lang === 'ne' ? 'नाम' : 'Name'}</th>
                  <th className="p-3">{lang === 'ne' ? 'इमेल / फोन' : 'Contact'}</th>
                  <th className="p-3">{lang === 'ne' ? 'भूमिका' : 'Role'}</th>
                  <th className="p-3 text-right">{lang === 'ne' ? 'स्थिति' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F1EC]">
                {usersList.map((u) => (
                  <tr key={String(u.id)}>
                    <td className="p-3 font-medium">{String(u.full_name)}</td>
                    <td className="p-3">{String(u.email || u.phone)}</td>
                    <td className="p-3 font-mono">{String(u.role)}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await apiFetch(`/api/admin/users/${u.id}/toggle-active`, { method: 'PATCH' });
                          loadTab('users');
                        }}
                      >
                        {u.is_active ? (lang === 'ne' ? 'सक्रिय' : 'Active') : lang === 'ne' ? 'निष्क्रिय' : 'Disabled'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* LOGS & SUPPORT */}
        {tab === 'logs' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-sm">{lang === 'ne' ? 'सहायता टिकटहरू' : 'Support Tickets'}</h2>
              {logs.tickets.map((tk) => (
                <div key={String(tk.id)} className="p-3 rounded border border-[#E5E2DC] text-xs space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>
                      {String(tk.subject)} — {String(tk.cooperative_name_ne || '')}
                    </span>
                    <span>{String(tk.status)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id={`reply_${tk.id}`}
                      placeholder={lang === 'ne' ? 'प्रतिक्रिया लेख्नुहोस्...' : 'Write reply...'}
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        const input = document.getElementById(`reply_${tk.id}`) as HTMLInputElement;
                        if (!input?.value) return;
                        await apiFetch(`/api/admin/tickets/${tk.id}/reply`, {
                          method: 'POST',
                          body: JSON.stringify({ message: input.value, status: 'resolved' }),
                        });
                        input.value = '';
                        loadTab('logs');
                      }}
                    >
                      {lang === 'ne' ? 'जवाफ पठाउनुहोस्' : 'Reply & Resolve'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">
                  Akash SMS & Supabase Diagnostics
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const r = await apiFetch<{
                      supabase: { message: string; connected: boolean; migrationsApplied: boolean };
                      akashSms: { configured: boolean; endpoint: string };
                    }>('/api/admin/integrations-status');
                    if (r.ok) {
                      toast.info(`Supabase: ${r.data.supabase.message}`);
                    }
                  }}
                >
                  {lang === 'ne' ? 'Supabase जडान जाँच्नुहोस्' : 'Check Supabase Connection'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 items-center pt-1">
                <Input
                  id="test_sms_phone"
                  placeholder="98XXXXXXXX (Test Akash SMS)"
                  className="max-w-xs h-9 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const input = document.getElementById('test_sms_phone') as HTMLInputElement;
                    if (!input?.value) return;
                    const r = await apiFetch<{ message: string }>('/api/admin/test-sms', {
                      method: 'POST',
                      body: JSON.stringify({ phone: input.value }),
                    });
                    if (r.ok) toast.success(r.data.message);
                    else toast.error(r.error || r.data?.message || 'SMS test failed');
                    loadTab('logs');
                  }}
                >
                  {lang === 'ne' ? 'परीक्षण SMS पठाउनुहोस्' : 'Send Test SMS'}
                </Button>
                <span className="text-xs text-[#57534E]">
                  Status: {logs.smsConfigured ? 'Akash Auth Token Detected' : 'AKASH_SMS_API_KEY not set in env'}
                </span>
              </div>

              <div className="divide-y divide-[#F3F1EC] text-xs pt-2">
                {logs.smsLogs.map((s) => (
                  <div key={String(s.id)} className="py-2 flex justify-between gap-3">
                    <span className="font-mono shrink-0">
                      {String(s.recipient_phone)} · {String(s.purpose)}
                    </span>
                    <span className="text-right truncate">
                      {String(s.status)} — {String(s.provider_response || '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
