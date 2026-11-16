import { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  CreditCard,
  Database,
  Eye,
  Globe,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import { DataCleanupMaintenancePanel } from '../components/admin/DataCleanupMaintenancePanel';
import { toast } from 'sonner';

type AdminTab = 'overview' | 'cooperatives' | 'plans' | 'marketplace' | 'users' | 'logs' | 'maintenance';

interface ConfirmState {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
  onConfirm: (reason?: string) => Promise<void>;
}

interface IntegrationsStatus {
  supabase?: { message: string; connected: boolean; migrationsApplied: boolean };
  akashSms?: { configured: boolean; endpoint: string };
  gemini?: { configured: boolean; model: string };
}

interface AiUsagePayload {
  stats: {
    today_ktm?: string;
    total_completed?: number;
    today_completed?: number;
    total_failed?: number;
    active_coops_today?: number;
    by_cooperative?: Array<Record<string, unknown>>;
  };
  recentGenerations: Array<Record<string, unknown>>;
  geminiConfigured: boolean;
  model: string;
}

export function SuperAdminDashboardPage() {
  const { lang, user, logout, navigate } = useApp();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loadingTab, setLoadingTab] = useState(false);

  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [cooperatives, setCooperatives] = useState<Array<Record<string, unknown>>>([]);
  const [selectedCoop, setSelectedCoop] = useState<Record<string, unknown> | null>(null);
  const [assignSubCoop, setAssignSubCoop] = useState<Record<string, unknown> | null>(null);
  const [assignForm, setAssignForm] = useState({ planId: '', billingCycle: 'monthly', extendDays: '30' });
  const [assigningSub, setAssigningSub] = useState(false);

  const [plansData, setPlansData] = useState<{
    plans: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  }>({ plans: [], payments: [] });
  const [creatingPlan, setCreatingPlan] = useState(false);
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
  const [savingBranding, setSavingBranding] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const [togglingCatId, setTogglingCatId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ nameNe: '', nameEn: '' });
  const [productFilter, setProductFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Record<string, unknown> | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsagePayload | null>(null);

  const [usersList, setUsersList] = useState<Array<Record<string, unknown>>>([]);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const [logs, setLogs] = useState<{
    auditLogs: Array<Record<string, unknown>>;
    loginActivities: Array<Record<string, unknown>>;
    smsLogs: Array<Record<string, unknown>>;
    tickets: Array<Record<string, unknown>>;
    smsConfigured: boolean;
  }>({ auditLogs: [], loginActivities: [], smsLogs: [], tickets: [], smsConfigured: false });
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  const [diagStatus, setDiagStatus] = useState<IntegrationsStatus | null>(null);
  const [checkingDiag, setCheckingDiag] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testingSms, setTestingSms] = useState(false);

  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const loadTab = async (active: AdminTab) => {
    setLoadingTab(true);
    try {
      if (active === 'overview') {
        const [ovRes, diagRes] = await Promise.all([
          apiFetch<Record<string, unknown>>('/api/admin/overview'),
          apiFetch<IntegrationsStatus>('/api/admin/integrations-status'),
        ]);
        if (ovRes.ok) setOverview(ovRes.data);
        else toast.error(ovRes.error || 'Failed to load overview');
        if (diagRes.ok) setDiagStatus(diagRes.data);
      } else if (active === 'cooperatives') {
        const [coopRes, planRes] = await Promise.all([
          apiFetch<{ cooperatives: Array<Record<string, unknown>> }>('/api/admin/cooperatives'),
          plansData.plans.length === 0
            ? apiFetch<typeof plansData>('/api/admin/plans')
            : Promise.resolve(null),
        ]);
        if (coopRes.ok) setCooperatives(coopRes.data.cooperatives);
        else toast.error(coopRes.error || 'Failed to load cooperatives');
        if (planRes && planRes.ok) setPlansData(planRes.data);
      } else if (active === 'plans') {
        const r = await apiFetch<typeof plansData>('/api/admin/plans');
        if (r.ok) setPlansData(r.data);
        else toast.error(r.error || 'Failed to load plans');
      } else if (active === 'marketplace') {
        const [mktRes, aiRes] = await Promise.all([
          apiFetch<typeof marketCtrl>('/api/admin/marketplace-controls'),
          apiFetch<AiUsagePayload>('/api/admin/ai-usage'),
        ]);
        if (mktRes.ok) setMarketCtrl(mktRes.data);
        else toast.error(mktRes.error || 'Failed to load platform controls');
        if (aiRes.ok) setAiUsage(aiRes.data);
      } else if (active === 'users') {
        const r = await apiFetch<{ users: Array<Record<string, unknown>> }>('/api/admin/users');
        if (r.ok) setUsersList(r.data.users);
        else toast.error(r.error || 'Failed to load users');
      } else if (active === 'logs') {
        const [logRes, diagRes] = await Promise.all([
          apiFetch<typeof logs>('/api/admin/logs'),
          apiFetch<IntegrationsStatus>('/api/admin/integrations-status'),
        ]);
        if (logRes.ok) setLogs(logRes.data);
        else toast.error(logRes.error || 'Failed to load logs');
        if (diagRes.ok) setDiagStatus(diagRes.data);
      }
    } finally {
      setLoadingTab(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'super_admin') loadTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCoop(null);
        setAssignSubCoop(null);
        setSelectedProduct(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!user || user.role !== 'super_admin') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <ShieldCheck className="w-10 h-10 mx-auto text-[#B91C1C]" />
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'सुपर एडमिन नियन्त्रण कक्ष' : 'SaaS Super-Admin Control Panel'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {user
            ? lang === 'ne'
              ? `तपाईं हाल ${user.email || user.phone} (${user.role}) बाट लगइन हुनुहुन्छ। यहाँ प्रवेश गर्न सुपर एडमिन खाता आवश्यक छ।`
              : `Signed in as ${user.email || user.phone} (${user.role}). Super-Admin authorization is required here.`
            : lang === 'ne'
            ? 'यो क्षेत्रमा प्रवेश गर्न सर्भर-प्रमाणित सुपर एडमिन अधिकार आवश्यक छ।'
            : 'Server-verified Super-Admin authorization is required.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {!user ? (
            <Button onClick={() => navigate('/login')}>{lang === 'ne' ? 'सुपर एडमिन लगइन' : 'Sign In'}</Button>
          ) : (
            <>
              <Button
                onClick={() =>
                  navigate(
                    user.role === 'cooperative_admin' || user.role === 'cooperative_staff'
                      ? '/cooperative'
                      : '/account'
                  )
                }
              >
                {lang === 'ne' ? 'मेरो ड्यासबोर्डमा जानुहोस्' : 'Go to My Dashboard'}
              </Button>
              <Button variant="outline" onClick={logout}>
                {lang === 'ne' ? 'बाहिर निस्कनुहोस् (Sign Out)' : 'Sign Out'}
              </Button>
            </>
          )}
        </div>
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
    if (!res.ok) {
      toast.error(res.error || 'कार्य असफल भयो।');
      return;
    }
    toast.success(lang === 'ne' ? `सहकारी स्थिति "${status}" मा अद्यावधिक भयो।` : `Cooperative marked ${status}`);
    await loadTab('cooperatives');
  };

  const openDecisionConfirm = (coop: Record<string, unknown>, status: 'approved' | 'rejected' | 'suspended') => {
    const coopName = lang === 'ne' ? String(coop.name_ne || '') : String(coop.name_en || '');
    const config = {
      approved: {
        title: lang === 'ne' ? 'सहकारी स्वीकृत र सक्रिय गर्नुहोस्' : 'Approve Cooperative',
        description:
          lang === 'ne'
            ? `"${coopName}" लाई स्वीकृत गरी परीक्षण/सक्रिय पसलका रूपमा प्रकाशित गर्नुहुन्छ?`
            : `Approve "${coopName}" and publish its cooperative store?`,
        confirmLabel: lang === 'ne' ? 'स्वीकृत गर्नुहोस्' : 'Approve & Activate',
        variant: 'default' as const,
        defaultReason: 'Documents verified',
      },
      rejected: {
        title: lang === 'ne' ? 'सहकारी दर्ता अस्वीकृत गर्नुहोस्' : 'Reject Cooperative Application',
        description:
          lang === 'ne'
            ? `"${coopName}" को दर्ता अनुरोध अस्वीकृत गर्नुहोस् र कारण उल्लेख गर्नुहोस्।`
            : `Reject "${coopName}" and record a clear reason.`,
        confirmLabel: lang === 'ne' ? 'अस्वीकृत गर्नुहोस्' : 'Reject',
        variant: 'destructive' as const,
        defaultReason: 'Incomplete registration documents',
      },
      suspended: {
        title: lang === 'ne' ? 'सहकारी निलम्बन गर्नुहोस्' : 'Suspend Cooperative Store',
        description:
          lang === 'ne'
            ? `"${coopName}" निलम्बन गर्दा यसको पसल सार्वजनिक बजारबाट अस्थायी रूपमा हट्नेछ।`
            : `Suspending "${coopName}" temporarily hides its store from the public marketplace.`,
        confirmLabel: lang === 'ne' ? 'निलम्बन गर्नुहोस्' : 'Suspend',
        variant: 'destructive' as const,
        defaultReason: 'Policy or verification review',
      },
    }[status];

    setConfirmState({
      open: true,
      title: config.title,
      description: config.description,
      confirmLabel: config.confirmLabel,
      variant: config.variant,
      requireReason: true,
      reasonLabel: lang === 'ne' ? 'टिप्पणी / कारण' : 'Decision Reason',
      reasonPlaceholder: lang === 'ne' ? 'कारण लेख्नुहोस्...' : 'Enter reason...',
      defaultReason: config.defaultReason,
      onConfirm: async (reason) => {
        await handleDecision(String(coop.id), status, reason || config.defaultReason);
      },
    });
  };

  const runConfirmAction = async (reason?: string) => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.onConfirm(reason);
      setConfirmState(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <aside className="lg:col-span-3 bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-4">
        <div className="pb-3 border-b border-[#E5E2DC] flex items-center justify-between gap-2">
          <div>
            <p className="text-xs text-[#B91C1C] font-semibold">SaaS Super Admin</p>
            <p className="font-semibold text-sm text-[#0F172A]">{user.full_name}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={loadingTab}
            onClick={() => loadTab(tab)}
            title={lang === 'ne' ? 'ताजा गर्नुहोस्' : 'Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTab ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer text-left ${
                tab === item.id ? 'bg-[#0F172A] text-white' : 'text-[#57534E] hover:bg-[#F3F1EC]'
              }`}
            >
              {item.icon}
              <span className="truncate">{lang === 'ne' ? item.ne : item.en}</span>
            </button>
          ))}
        </nav>

        <div className="pt-3 border-t border-[#E5E2DC] space-y-1.5">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[#78716C]">
            {lang === 'ne' ? 'प्रणाली मर्मत (System Maintenance)' : 'System Maintenance'}
          </p>
          <button
            type="button"
            onClick={() => setTab('maintenance')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer text-left ${
              tab === 'maintenance' ? 'bg-[#B91C1C] text-white' : 'text-[#57534E] hover:bg-[#F3F1EC]'
            }`}
          >
            <Database className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {lang === 'ne' ? 'डाटा सफाई र मर्मत' : 'Data Cleanup & Maintenance'}
            </span>
          </button>
        </div>

        <div className="pt-3 border-t border-[#E5E2DC]">
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#57534E] hover:bg-red-50 hover:text-[#B91C1C] transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{lang === 'ne' ? 'बाहिर निस्कनुहोस् (Sign Out)' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      <div className="lg:col-span-9 space-y-6">
        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => setTab('cooperatives')}
                className="text-left bg-white border border-[#E5E2DC] rounded-xl p-4 hover:border-[#0F172A]/40 transition-colors cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'जम्मा सहकारी' : 'Total Cooperatives'}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(coopCounts.total || 0) : coopCounts.total || 0}
                </p>
                <p className="text-xs text-[#15803D] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `स्वीकृत: ${toNepaliDigits(coopCounts.approved || 0)} · प्रतीक्षारत: ${toNepaliDigits(coopCounts.pending || 0)}`
                    : `Approved: ${coopCounts.approved || 0} · Pending: ${coopCounts.pending || 0}`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTab('marketplace')}
                className="text-left bg-white border border-[#E5E2DC] rounded-xl p-4 hover:border-[#0F172A]/40 transition-colors cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'बजार कारोबार (GMV)' : 'Marketplace GMV'}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{formatNPR(mStats.gmv_npr || 0, lang)}</p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `अर्डर: ${toNepaliDigits(mStats.total_orders || 0)} (अतिथि: ${toNepaliDigits(mStats.guest_orders || 0)})`
                    : `Orders: ${mStats.total_orders || 0} (Guest: ${mStats.guest_orders || 0})`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTab('plans')}
                className="text-left bg-white border border-[#E5E2DC] rounded-xl p-4 hover:border-[#0F172A]/40 transition-colors cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'मासिक आवर्ती राजस्व (MRR)' : 'Monthly Recurring Revenue'}</p>
                <p className="text-xl font-bold text-[#15803D] tabular-nums mt-1">
                  {formatNPR(Number(overview?.mrrNpr || 0), lang)}
                </p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `सक्रिय सदस्यता: ${toNepaliDigits(subCounts.active_subs || 0)}`
                    : `Active Subs: ${subCounts.active_subs || 0}`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setTab('marketplace')}
                className="text-left bg-white border border-[#E5E2DC] rounded-xl p-4 hover:border-[#0F172A]/40 transition-colors cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'कुल उत्पादन र क्रेता' : 'Products & Buyers'}</p>
                <p className="text-2xl font-bold tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(mStats.total_products || 0) : mStats.total_products || 0}
                </p>
                <p className="text-xs text-[#57534E] mt-1 tabular-nums">
                  {lang === 'ne'
                    ? `दर्ता क्रेता: ${toNepaliDigits(mStats.registered_buyers || 0)}`
                    : `Buyers: ${mStats.registered_buyers || 0}`}
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-1">
                <p className="text-[#78716C] font-medium">Supabase PostgreSQL</p>
                <p className={`font-semibold ${diagStatus?.supabase?.connected ? 'text-[#15803D]' : 'text-[#57534E]'}`}>
                  {diagStatus?.supabase ? diagStatus.supabase.message : lang === 'ne' ? 'जाँच हुँदै...' : 'Checking...'}
                </p>
              </div>
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-1">
                <p className="text-[#78716C] font-medium">Akash SMS Gateway</p>
                <p className={`font-semibold ${overview?.smsConfigured ? 'text-[#15803D]' : 'text-amber-700'}`}>
                  {overview?.smsConfigured
                    ? lang === 'ne'
                      ? 'सक्रिय (Env कन्फिगर गरिएको)'
                      : 'Configured (Server Env)'
                    : lang === 'ne'
                    ? 'कन्फिगर नगरिएको'
                    : 'Unconfigured (Env Key Required)'}
                </p>
              </div>
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 text-xs space-y-1">
                <p className="text-[#78716C] font-medium">Gemini AI Product Assistant</p>
                <p className={`font-semibold ${diagStatus?.gemini?.configured ? 'text-[#15803D]' : 'text-amber-700'}`}>
                  {diagStatus?.gemini?.configured
                    ? `Configured (${diagStatus.gemini.model})`
                    : lang === 'ne'
                    ? `कन्फिगर नगरिएको (${diagStatus?.gemini?.model || 'GEMINI_API_KEY'})`
                    : `Unconfigured (${diagStatus?.gemini?.model || 'GEMINI_API_KEY needed'})`}
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm">
                  {lang === 'ne' ? 'हालैका प्रशासनिक गतिविधि' : 'Recent Platform Audit Activity'}
                </h2>
                <button
                  type="button"
                  onClick={() => setTab('logs')}
                  className="text-xs text-[#B91C1C] hover:underline cursor-pointer"
                >
                  {lang === 'ne' ? 'सबै लग हेर्नुहोस्' : 'View Full Logs'}
                </button>
              </div>
              <div className="divide-y divide-[#F3F1EC] text-xs">
                {((overview?.recentAudits as Array<Record<string, unknown>>) || []).length === 0 ? (
                  <p className="py-4 text-[#78716C]">{lang === 'ne' ? 'हाल कुनै अडिट लग छैन।' : 'No recent audit events.'}</p>
                ) : (
                  ((overview?.recentAudits as Array<Record<string, unknown>>) || []).map((a) => (
                    <div key={String(a.id)} className="py-2.5 flex justify-between gap-2">
                      <span>
                        <strong className="font-mono">{String(a.action)}</strong> · {String(a.entity_type)} (
                        {String(a.actor_name || 'System')})
                      </span>
                      <span className="text-[#78716C] tabular-nums shrink-0">{formatDateBS(String(a.created_at), lang)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* COOPERATIVES ADMIN */}
        {tab === 'cooperatives' && (
          <div className="space-y-4">
            {cooperatives.length === 0 ? (
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-8 text-center text-sm text-[#78716C]">
                {loadingTab
                  ? lang === 'ne'
                    ? 'सहकारी विवरण लोड हुँदैछ...'
                    : 'Loading cooperatives...'
                  : lang === 'ne'
                  ? 'कुनै सहकारी दर्ता भेटिएन।'
                  : 'No cooperatives found.'}
              </div>
            ) : (
              cooperatives.map((c) => (
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
                        Rep: {String(c.authorized_rep_name)} ({String(c.authorized_rep_designation)}) ·{' '}
                        {String(c.contact_phone)}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <span className="text-xs font-bold text-[#B91C1C]">
                        {labelFor(STATUS_LABELS, String(c.status), lang)}
                      </span>
                      <p className="text-xs text-[#57534E]">
                        {c.plan_name_en ? `Plan: ${String(c.plan_name_en)}` : 'No active plan'}
                        {c.subscription_status ? ` (${String(c.subscription_status)})` : ''}
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
                    <Button size="sm" variant="outline" onClick={() => setSelectedCoop(c)}>
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      {lang === 'ne' ? 'विवरण हेर्नुहोस्' : 'View Details'}
                    </Button>
                    {Boolean(c.slug && c.is_published) && (
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/store/${String(c.slug)}`)}>
                        {lang === 'ne' ? 'पसल हेर्नुहोस्' : 'Visit Store'}
                      </Button>
                    )}
                    {c.status !== 'approved' && (
                      <Button size="sm" onClick={() => openDecisionConfirm(c, 'approved')}>
                        {c.status === 'suspended'
                          ? lang === 'ne'
                            ? 'पुनः सक्रिय गर्नुहोस्'
                            : 'Reactivate'
                          : lang === 'ne'
                          ? 'स्वीकृत गर्नुहोस्'
                          : 'Approve & Activate Trial'}
                      </Button>
                    )}
                    {c.status === 'pending_review' && (
                      <Button size="sm" variant="outline" onClick={() => openDecisionConfirm(c, 'rejected')}>
                        {lang === 'ne' ? 'अस्वीकृत' : 'Reject'}
                      </Button>
                    )}
                    {c.status === 'approved' && (
                      <Button size="sm" variant="outline" onClick={() => openDecisionConfirm(c, 'suspended')}>
                        {lang === 'ne' ? 'निलम्बन गर्नुहोस्' : 'Suspend'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const defaultPlanId = String(c.plan_id || plansData.plans[0]?.id || '');
                        setAssignForm({ planId: defaultPlanId, billingCycle: 'monthly', extendDays: '30' });
                        setAssignSubCoop(c);
                      }}
                    >
                      {lang === 'ne' ? 'सदस्यता दिनुहोस्' : 'Assign Plan'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res = await apiFetch(`/api/admin/cooperatives/${c.id}/featured`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isFeatured: !c.is_featured }),
                        });
                        if (!res.ok) return toast.error(res.error || 'Failed to update featured state');
                        toast.success(lang === 'ne' ? 'विशेष पसल स्थिति अद्यावधिक भयो' : 'Featured status updated');
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
              ))
            )}
          </div>
        )}

        {/* PLANS & BILLING */}
        {tab === 'plans' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-base">
                {lang === 'ne' ? 'उपलब्ध सदस्यता योजनाहरू' : 'Configured Subscription Plans'}
              </h2>
              {plansData.plans.length === 0 ? (
                <p className="text-xs text-[#78716C]">{lang === 'ne' ? 'कुनै योजना छैन।' : 'No plans configured.'}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {plansData.plans.map((p) => (
                    <div key={String(p.id)} className="border border-[#E5E2DC] rounded-lg p-3 space-y-1 bg-[#FAF9F6]">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm text-[#0F172A]">
                          {lang === 'ne' ? String(p.name_ne) : String(p.name_en)}
                        </strong>
                        <span className="font-mono text-[11px] text-[#78716C]">{String(p.code)}</span>
                      </div>
                      <p className="text-[#57534E]">
                        {formatNPR(Number(p.monthly_price_npr || 0), lang)} / {lang === 'ne' ? 'महिना' : 'mo'} ·{' '}
                        {formatNPR(Number(p.annual_price_npr || 0), lang)} / {lang === 'ne' ? 'वर्ष' : 'yr'}
                      </p>
                      <p className="text-[#78716C]">
                        Max products: {String(p.max_products)} · Max staff: {String(p.max_staff)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setCreatingPlan(true);
                try {
                  const r = await apiFetch('/api/admin/plans', { method: 'POST', body: JSON.stringify(newPlan) });
                  if (!r.ok) return toast.error(r.error || 'योजना थप्न सकिएन');
                  toast.success(lang === 'ne' ? 'नयाँ सदस्यता योजना थपियो' : 'Plan created');
                  setNewPlan({
                    code: '',
                    nameNe: '',
                    nameEn: '',
                    monthlyPriceNpr: '1500',
                    annualPriceNpr: '15000',
                    maxProducts: '100',
                    maxStaff: '5',
                  });
                  loadTab('plans');
                } finally {
                  setCreatingPlan(false);
                }
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h2 className="font-semibold text-base">
                {lang === 'ne' ? 'नयाँ सदस्यता योजना थप्नुहोस्' : 'Create Configurable Plan'}
              </h2>
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
              <Button type="submit" disabled={creatingPlan}>
                {creatingPlan
                  ? lang === 'ne'
                    ? 'सुरक्षित हुँदै...'
                    : 'Creating...'
                  : lang === 'ne'
                  ? 'योजना सुरक्षित गर्नुहोस्'
                  : 'Create Plan'}
              </Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm">
                {lang === 'ne' ? 'सदस्यता भुक्तानी प्रमाणीकरण' : 'Subscription Payment Verification'}
              </h3>
              {plansData.payments.length === 0 ? (
                <p className="text-xs text-[#78716C]">
                  {lang === 'ne' ? 'कुनै म्यानुअल भुक्तानी अनुरोध छैन।' : 'No pending payments.'}
                </p>
              ) : (
                plansData.payments.map((pay) => (
                  <div
                    key={String(pay.id)}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-[#F3F1EC] text-xs"
                  >
                    <span>
                      <strong>{lang === 'ne' ? String(pay.cooperative_name_ne) : String(pay.cooperative_name_en)}</strong> —{' '}
                      {String(pay.plan_name_en)} ({formatNPR(Number(pay.amount_npr), lang)}) · Ref:{' '}
                      {String(pay.reference_number)}
                    </span>
                    {pay.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: lang === 'ne' ? 'भुक्तानी प्रमाणित गर्नुहोस्' : 'Verify & Activate Payment',
                              description:
                                lang === 'ne'
                                  ? `सन्दर्भ नं ${String(pay.reference_number)} प्रमाणित गरी सदस्यता सक्रिय गर्नुहुन्छ?`
                                  : `Confirm verification of reference ${String(pay.reference_number)} and activate subscription?`,
                              confirmLabel: lang === 'ne' ? 'प्रमाणित र सक्रिय' : 'Verify & Activate',
                              onConfirm: async () => {
                                const res = await apiFetch(`/api/admin/subscription-payments/${pay.id}/verify`, {
                                  method: 'POST',
                                  body: JSON.stringify({ decision: 'verified' }),
                                });
                                if (!res.ok) toast.error(res.error || 'Failed to verify payment');
                                else {
                                  toast.success(lang === 'ne' ? 'भुक्तानी प्रमाणित भयो' : 'Payment verified');
                                  await loadTab('plans');
                                }
                              },
                            })
                          }
                        >
                          {lang === 'ne' ? 'प्रमाणित र सक्रिय' : 'Verify & Activate'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setConfirmState({
                              open: true,
                              title: lang === 'ne' ? 'भुक्तानी अस्वीकृत गर्नुहोस्' : 'Reject Subscription Payment',
                              description:
                                lang === 'ne'
                                  ? `सन्दर्भ नं ${String(pay.reference_number)} को भुक्तानी अस्वीकृत गर्नुहुन्छ?`
                                  : `Reject payment submission with reference ${String(pay.reference_number)}?`,
                              confirmLabel: lang === 'ne' ? 'अस्वीकृत गर्नुहोस्' : 'Reject',
                              variant: 'destructive',
                              onConfirm: async () => {
                                const res = await apiFetch(`/api/admin/subscription-payments/${pay.id}/verify`, {
                                  method: 'POST',
                                  body: JSON.stringify({ decision: 'rejected' }),
                                });
                                if (!res.ok) toast.error(res.error || 'Failed to reject payment');
                                else {
                                  toast.success(lang === 'ne' ? 'भुक्तानी अस्वीकृत भयो' : 'Payment rejected');
                                  await loadTab('plans');
                                }
                              },
                            })
                          }
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

        {/* MARKETPLACE CONTROLS, AI MONITOR & READ-ONLY PRODUCT MONITORING */}
        {tab === 'marketplace' && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingBranding(true);
                try {
                  const res = await apiFetch('/api/admin/settings/branding', {
                    method: 'PUT',
                    body: JSON.stringify(marketCtrl.branding),
                  });
                  if (!res.ok) return toast.error(res.error || 'सेटिङ सुरक्षित गर्न सकिएन');
                  toast.success(lang === 'ne' ? 'प्लेटफर्म सेटिङ सुरक्षित भयो' : 'Branding & announcements saved');
                } finally {
                  setSavingBranding(false);
                }
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h2 className="font-semibold text-sm">
                {lang === 'ne' ? 'प्लेटफर्म घोषणा तथा ब्रान्डिङ' : 'Platform Announcement Banner'}
              </h2>
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
              <Button type="submit" size="sm" disabled={savingBranding}>
                {savingBranding
                  ? lang === 'ne'
                    ? 'सुरक्षित हुँदै...'
                    : 'Saving...'
                  : lang === 'ne'
                  ? 'घोषणा अद्यावधिक'
                  : 'Save Announcement'}
              </Button>
            </form>

            {/* GLOBAL CATEGORIES MANAGEMENT */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-sm">{lang === 'ne' ? 'वैश्विक उत्पादन वर्गहरू' : 'Global Categories'}</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setCreatingCat(true);
                  try {
                    const r = await apiFetch('/api/admin/categories', { method: 'POST', body: JSON.stringify(newCat) });
                    if (!r.ok) return toast.error(r.error || 'वर्ग थप्न सकिएन');
                    toast.success(lang === 'ne' ? 'नयाँ वर्ग थपियो' : 'Global category added');
                    setNewCat({ nameNe: '', nameEn: '' });
                    loadTab('marketplace');
                  } finally {
                    setCreatingCat(false);
                  }
                }}
                className="flex flex-wrap gap-3"
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
                <Button type="submit" disabled={creatingCat}>
                  {creatingCat ? '...' : lang === 'ne' ? 'वर्ग थप्नुहोस्' : 'Add Global Category'}
                </Button>
              </form>

              {marketCtrl.categories.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                  {marketCtrl.categories.map((cat) => (
                    <div
                      key={String(cat.id)}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6] text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#0F172A] truncate">
                          {lang === 'ne' ? String(cat.name_ne) : String(cat.name_en)}
                        </p>
                        <p className="text-[11px] font-mono text-[#78716C] truncate">{String(cat.slug)}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={togglingCatId === String(cat.id)}
                        onClick={async () => {
                          setTogglingCatId(String(cat.id));
                          try {
                            const res = await apiFetch(`/api/admin/categories/${cat.id}/toggle`, { method: 'PATCH' });
                            if (!res.ok) return toast.error(res.error || 'Failed to toggle category');
                            await loadTab('marketplace');
                          } finally {
                            setTogglingCatId(null);
                          }
                        }}
                      >
                        {cat.is_active ? (lang === 'ne' ? 'सक्रिय' : 'Active') : lang === 'ne' ? 'निष्क्रिय' : 'Inactive'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PLATFORM AI USAGE MONITOR */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <h2 className="font-semibold text-sm text-[#0F172A] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B91C1C]" />
                    {lang === 'ne' ? 'प्लेटफर्म AI उत्पादन प्रयोग अनुगमन' : 'Platform AI Product Assistant Monitor'}
                  </h2>
                  <p className="text-xs text-[#57534E]">
                    {lang === 'ne'
                      ? 'प्रत्येक सहकारी पसलका लागि दैनिक २ नि:शुल्क AI जेनेरेसन कोटा (Asia/Kathmandu समय अनुसार)'
                      : 'Free daily quota: 2 generations per cooperative per Nepal-local day (Asia/Kathmandu)'}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded border ${
                    aiUsage?.geminiConfigured
                      ? 'border-emerald-200 bg-emerald-50 text-[#15803D]'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {aiUsage?.geminiConfigured
                    ? `Gemini Live · ${aiUsage.model}`
                    : `Gemini Unconfigured · ${aiUsage?.model || 'default'}`}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="border border-[#E5E2DC] rounded-lg p-3 bg-[#FAF9F6]">
                  <p className="text-[#78716C]">{lang === 'ne' ? 'आजको सफल AI जेनेरेसन' : 'Today Completed'}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {lang === 'ne'
                      ? toNepaliDigits(aiUsage?.stats?.today_completed || 0)
                      : aiUsage?.stats?.today_completed || 0}
                  </p>
                </div>
                <div className="border border-[#E5E2DC] rounded-lg p-3 bg-[#FAF9F6]">
                  <p className="text-[#78716C]">{lang === 'ne' ? 'आज सक्रिय सहकारी' : 'Active Coops Today'}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {lang === 'ne'
                      ? toNepaliDigits(aiUsage?.stats?.active_coops_today || 0)
                      : aiUsage?.stats?.active_coops_today || 0}
                  </p>
                </div>
                <div className="border border-[#E5E2DC] rounded-lg p-3 bg-[#FAF9F6]">
                  <p className="text-[#78716C]">{lang === 'ne' ? 'कुल सफल जेनेरेसन' : 'Total Completed'}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {lang === 'ne'
                      ? toNepaliDigits(aiUsage?.stats?.total_completed || 0)
                      : aiUsage?.stats?.total_completed || 0}
                  </p>
                </div>
                <div className="border border-[#E5E2DC] rounded-lg p-3 bg-[#FAF9F6]">
                  <p className="text-[#78716C]">{lang === 'ne' ? 'असफल प्रयास' : 'Failed Attempts'}</p>
                  <p className="text-lg font-bold tabular-nums mt-0.5">
                    {lang === 'ne'
                      ? toNepaliDigits(aiUsage?.stats?.total_failed || 0)
                      : aiUsage?.stats?.total_failed || 0}
                  </p>
                </div>
              </div>

              {(aiUsage?.stats?.by_cooperative || []).length > 0 && (
                <div className="overflow-x-auto border border-[#E5E2DC] rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#E5E2DC] text-left text-[#78716C] bg-[#FAF9F6]">
                        <th className="p-2.5">{lang === 'ne' ? 'सहकारी पसल' : 'Cooperative'}</th>
                        <th className="p-2.5 text-right">{lang === 'ne' ? 'आज प्रयोग (सीमा २)' : 'Today Used (Limit 2)'}</th>
                        <th className="p-2.5 text-right">{lang === 'ne' ? 'कुल सफल' : 'Total Completed'}</th>
                        <th className="p-2.5 text-right">{lang === 'ne' ? 'अन्तिम प्रयोग' : 'Last Used'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F1EC]">
                      {(aiUsage?.stats?.by_cooperative || []).map((row) => (
                        <tr key={String(row.cooperative_id)}>
                          <td className="p-2.5 font-medium text-[#0F172A]">
                            {lang === 'ne'
                              ? String(row.cooperative_name_ne || '')
                              : String(row.cooperative_name_en || '')}
                          </td>
                          <td className="p-2.5 text-right tabular-nums">
                            {Number(row.today_used || 0)} / 2
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{Number(row.total_completed || 0)}</td>
                          <td className="p-2.5 text-right text-[#78716C] tabular-nums">
                            {row.last_generated_at ? formatDateBS(String(row.last_generated_at), lang) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(aiUsage?.recentGenerations || []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#57534E]">
                    {lang === 'ne' ? 'हालैका AI जेनेरेसन गतिविधि' : 'Recent AI Generation Events'}
                  </p>
                  <div className="divide-y divide-[#F3F1EC] text-xs max-h-56 overflow-y-auto border border-[#E5E2DC] rounded-lg px-3">
                    {(aiUsage?.recentGenerations || []).map((g) => (
                      <div key={String(g.id)} className="py-2 flex flex-wrap justify-between gap-2">
                        <span>
                          <strong>{String(g.product_name_input)}</strong> ·{' '}
                          {lang === 'ne' ? String(g.cooperative_name_ne || '') : String(g.cooperative_name_en || '')} (
                          {String(g.language).toUpperCase()}, {String(g.mode)})
                        </span>
                        <span className="text-[#78716C] tabular-nums">
                          {String(g.status)} · {String(g.generation_date_ktm)}
                          {g.error_message ? ` — ${String(g.error_message)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* COOPERATIVE PRODUCTS MONITOR (READ-ONLY) */}
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
                      <th className="p-3 text-right">{lang === 'ne' ? 'विवरण' : 'Inspect'}</th>
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
                            {lang === 'ne' ? String(p.category_name_ne || '-') : String(p.category_name_en || '-')}
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
                          <td className="p-3 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedProduct(p)}
                              title={lang === 'ne' ? 'विवरण हेर्नुहोस्' : 'Inspect (Read-Only)'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
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
                    <td className="p-3">{String(u.email || u.phone || '-')}</td>
                    <td className="p-3 font-mono">{String(u.role)}</td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={togglingUserId === String(u.id)}
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            title: u.is_active
                              ? lang === 'ne'
                                ? 'प्रयोगकर्ता निष्क्रिय गर्नुहोस्'
                                : 'Deactivate User'
                              : lang === 'ne'
                              ? 'प्रयोगकर्ता सक्रिय गर्नुहोस्'
                              : 'Activate User',
                            description: `${String(u.full_name)} (${String(u.email || u.phone)})`,
                            confirmLabel: u.is_active
                              ? lang === 'ne'
                                ? 'निष्क्रिय गर्नुहोस्'
                                : 'Disable Account'
                              : lang === 'ne'
                              ? 'सक्रिय गर्नुहोस्'
                              : 'Activate Account',
                            variant: u.is_active ? 'destructive' : 'default',
                            onConfirm: async () => {
                              setTogglingUserId(String(u.id));
                              try {
                                const res = await apiFetch(`/api/admin/users/${u.id}/toggle-active`, { method: 'PATCH' });
                                if (!res.ok) {
                                  toast.error(res.error || 'प्रयोगकर्ता स्थिति बदल्न सकिएन');
                                  return;
                                }
                                toast.success(lang === 'ne' ? 'प्रयोगकर्ता स्थिति अद्यावधिक भयो' : 'User status updated');
                                await loadTab('users');
                              } finally {
                                setTogglingUserId(null);
                              }
                            },
                          })
                        }
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
              {logs.tickets.length === 0 ? (
                <p className="text-xs text-[#78716C]">{lang === 'ne' ? 'कुनै सहायता टिकट छैन।' : 'No support tickets.'}</p>
              ) : (
                logs.tickets.map((tk) => {
                  const tkId = String(tk.id);
                  const msgs = (tk.messages as Array<Record<string, unknown>>) || [];
                  return (
                    <div key={tkId} className="p-3 rounded-lg border border-[#E5E2DC] text-xs space-y-2.5">
                      <div className="flex flex-wrap justify-between gap-2 font-semibold">
                        <span>
                          {String(tk.subject)} — {String(tk.cooperative_name_ne || '')}
                        </span>
                        <span className="font-mono text-[#B91C1C]">{String(tk.status)}</span>
                      </div>

                      {msgs.length > 0 && (
                        <div className="space-y-1 bg-[#FAF9F6] p-2.5 rounded border border-[#F3F1EC] max-h-40 overflow-y-auto">
                          {msgs.map((m) => (
                            <div key={String(m.id)} className="text-[11px]">
                              <strong className="uppercase">{String(m.sender_role)}:</strong> {String(m.message)}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={ticketReplies[tkId] || ''}
                          onChange={(e) => setTicketReplies({ ...ticketReplies, [tkId]: e.target.value })}
                          placeholder={lang === 'ne' ? 'प्रतिक्रिया लेख्नुहोस्...' : 'Write reply...'}
                          className="h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          disabled={sendingReplyId === tkId || !(ticketReplies[tkId] || '').trim()}
                          onClick={async () => {
                            const msg = (ticketReplies[tkId] || '').trim();
                            if (!msg) return;
                            setSendingReplyId(tkId);
                            try {
                              const res = await apiFetch(`/api/admin/tickets/${tkId}/reply`, {
                                method: 'POST',
                                body: JSON.stringify({ message: msg, status: 'resolved' }),
                              });
                              if (!res.ok) return toast.error(res.error || 'जवाफ पठाउन सकिएन');
                              toast.success(lang === 'ne' ? 'प्रतिक्रिया पठाइयो' : 'Reply sent & ticket resolved');
                              setTicketReplies({ ...ticketReplies, [tkId]: '' });
                              await loadTab('logs');
                            } finally {
                              setSendingReplyId(null);
                            }
                          }}
                        >
                          {sendingReplyId === tkId
                            ? '...'
                            : lang === 'ne'
                            ? 'जवाफ पठाउनुहोस्'
                            : 'Reply & Resolve'}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">Akash SMS, Gemini AI & Supabase Diagnostics</h3>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={checkingDiag}
                  onClick={async () => {
                    setCheckingDiag(true);
                    try {
                      const r = await apiFetch<IntegrationsStatus>('/api/admin/integrations-status');
                      if (r.ok) {
                        setDiagStatus(r.data);
                        toast.info(
                          `Supabase: ${r.data.supabase?.message || 'OK'} · Gemini: ${
                            r.data.gemini?.configured ? 'Configured' : 'Unconfigured'
                          }`
                        );
                      } else {
                        toast.error(r.error || 'Diagnostics check failed');
                      }
                    } finally {
                      setCheckingDiag(false);
                    }
                  }}
                >
                  {checkingDiag
                    ? '...'
                    : lang === 'ne'
                    ? 'एकीकरण जडान जाँच्नुहोस्'
                    : 'Check Integrations'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 items-center pt-1">
                <Input
                  value={testSmsPhone}
                  onChange={(e) => setTestSmsPhone(e.target.value)}
                  placeholder="98XXXXXXXX (Test Akash SMS)"
                  className="max-w-xs h-9 text-xs font-mono"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={testingSms || !testSmsPhone.trim()}
                  onClick={async () => {
                    setTestingSms(true);
                    try {
                      const r = await apiFetch<{ message: string }>('/api/admin/test-sms', {
                        method: 'POST',
                        body: JSON.stringify({ phone: testSmsPhone.trim() }),
                      });
                      if (r.ok) toast.success(r.data.message);
                      else toast.error(r.error || r.data?.message || 'SMS test failed');
                      await loadTab('logs');
                    } finally {
                      setTestingSms(false);
                    }
                  }}
                >
                  {testingSms
                    ? '...'
                    : lang === 'ne'
                    ? 'परीक्षण SMS पठाउनुहोस्'
                    : 'Send Test SMS'}
                </Button>
                <span className="text-xs text-[#57534E]">
                  Status: {logs.smsConfigured ? 'Akash Auth Token Detected' : 'AKASH_SMS_API_KEY not set in env'}
                </span>
              </div>

              <div className="divide-y divide-[#F3F1EC] text-xs pt-2 max-h-56 overflow-y-auto">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
                <h3 className="font-semibold text-sm">{lang === 'ne' ? 'अडिट लग' : 'System Audit Logs'}</h3>
                <div className="divide-y divide-[#F3F1EC] text-xs max-h-64 overflow-y-auto">
                  {logs.auditLogs.map((a) => (
                    <div key={String(a.id)} className="py-2 flex justify-between gap-2">
                      <span>
                        <strong className="font-mono">{String(a.action)}</strong> · {String(a.entity_type)} (
                        {String(a.actor_name || 'System')})
                      </span>
                      <span className="text-[#78716C] tabular-nums shrink-0">{formatDateBS(String(a.created_at), lang)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
                <h3 className="font-semibold text-sm">{lang === 'ne' ? 'लगइन गतिविधि' : 'Login Activities'}</h3>
                <div className="divide-y divide-[#F3F1EC] text-xs max-h-64 overflow-y-auto">
                  {logs.loginActivities.map((l) => (
                    <div key={String(l.id)} className="py-2 flex justify-between gap-2">
                      <span className="truncate">
                        {String(l.identifier || l.user_id || '-')} ·{' '}
                        <strong className={l.success ? 'text-[#15803D]' : 'text-[#DC2626]'}>
                          {l.success ? 'Success' : `Failed${l.failure_reason ? ` (${String(l.failure_reason)})` : ''}`}
                        </strong>
                      </span>
                      <span className="text-[#78716C] tabular-nums shrink-0">{formatDateBS(String(l.created_at), lang)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'maintenance' && <DataCleanupMaintenancePanel />}
      </div>

      {/* COOPERATIVE DETAILS MODAL */}
      {selectedCoop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedCoop(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-mono text-[#78716C]">{String(selectedCoop.registration_number)}</p>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  {lang === 'ne' ? String(selectedCoop.name_ne) : String(selectedCoop.name_en)}
                </h3>
                <p className="text-xs text-[#57534E]">
                  {String(selectedCoop.province)} · {String(selectedCoop.district)} · {String(selectedCoop.municipality)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCoop(null)}
                className="text-[#78716C] hover:text-[#0F172A] p-1 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#FAF9F6] border border-[#E5E2DC] rounded-lg p-3">
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'प्रतिनिधि' : 'Representative'}</p>
                <p className="font-medium text-[#0F172A]">
                  {String(selectedCoop.authorized_rep_name || '-')} ({String(selectedCoop.authorized_rep_designation || '-')})
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'मालिक खाता' : 'Owner Account'}</p>
                <p className="font-medium text-[#0F172A]">
                  {String(selectedCoop.owner_name || '-')} · {String(selectedCoop.owner_email || selectedCoop.owner_phone || '')}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'सम्पर्क' : 'Contact'}</p>
                <p className="font-medium text-[#0F172A]">
                  {String(selectedCoop.contact_phone || '-')} · {String(selectedCoop.contact_email || '-')}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'पसल / सदस्यता' : 'Store & Subscription'}</p>
                <p className="font-medium text-[#0F172A]">
                  {selectedCoop.is_published ? 'Published' : 'Unpublished'} · {String(selectedCoop.plan_name_en || 'No Plan')}
                </p>
              </div>
            </div>

            {((selectedCoop.documents as Array<Record<string, unknown>>) || []).length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[#0F172A]">{lang === 'ne' ? 'कागजातहरू' : 'Submitted Documents'}</h4>
                <div className="flex flex-wrap gap-2 text-xs">
                  {((selectedCoop.documents as Array<Record<string, unknown>>) || []).map((d) => (
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
              </div>
            )}

            {((selectedCoop.history as Array<Record<string, unknown>>) || []).length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-semibold text-[#0F172A]">
                  {lang === 'ne' ? 'स्थिति परिवर्तन इतिहास' : 'Status History'}
                </h4>
                <div className="divide-y divide-[#F3F1EC] text-xs border border-[#E5E2DC] rounded-lg px-3">
                  {((selectedCoop.history as Array<Record<string, unknown>>) || []).map((h) => (
                    <div key={String(h.id)} className="py-2 flex justify-between gap-2">
                      <span>
                        <strong>{String(h.new_status || h.status || '')}</strong>
                        {h.reason ? ` — ${String(h.reason)}` : ''}
                      </span>
                      <span className="text-[#78716C] tabular-nums">{formatDateBS(String(h.created_at), lang)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ASSIGN SUBSCRIPTION MODAL */}
      {assignSubCoop && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAssignSubCoop(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!assignForm.planId) return toast.error(lang === 'ne' ? 'योजना छान्नुहोस्' : 'Select a plan');
              setAssigningSub(true);
              try {
                const res = await apiFetch(`/api/admin/cooperatives/${assignSubCoop.id}/assign-subscription`, {
                  method: 'POST',
                  body: JSON.stringify({
                    planId: assignForm.planId,
                    billingCycle: assignForm.billingCycle,
                    extendDays: Number(assignForm.extendDays || 30),
                  }),
                });
                if (!res.ok) return toast.error(res.error || 'Failed to assign subscription');
                toast.success(lang === 'ne' ? 'सदस्यता अद्यावधिक भयो' : 'Subscription assigned');
                setAssignSubCoop(null);
                await loadTab('cooperatives');
              } finally {
                setAssigningSub(false);
              }
            }}
            className="w-full max-w-md bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#0F172A]">
                  {lang === 'ne' ? 'सदस्यता योजना प्रदान गर्नुहोस्' : 'Assign / Extend Subscription'}
                </h3>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne' ? String(assignSubCoop.name_ne) : String(assignSubCoop.name_en)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignSubCoop(null)}
                className="text-[#78716C] hover:text-[#0F172A] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-medium">{lang === 'ne' ? 'सदस्यता योजना' : 'Plan'}</label>
                <Select
                  required
                  value={assignForm.planId}
                  onChange={(e) => setAssignForm({ ...assignForm, planId: e.target.value })}
                >
                  <option value="">-- {lang === 'ne' ? 'छान्नुहोस्' : 'Select Plan'} --</option>
                  {plansData.plans.map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {lang === 'ne' ? String(p.name_ne) : String(p.name_en)} ({formatNPR(Number(p.monthly_price_npr), lang)})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-medium">{lang === 'ne' ? 'अवधि चक्र' : 'Billing Cycle'}</label>
                  <Select
                    value={assignForm.billingCycle}
                    onChange={(e) => setAssignForm({ ...assignForm, billingCycle: e.target.value })}
                  >
                    <option value="monthly">{lang === 'ne' ? 'मासिक' : 'Monthly'}</option>
                    <option value="annual">{lang === 'ne' ? 'वार्षिक' : 'Annual'}</option>
                  </Select>
                </div>
                <div>
                  <label className="block mb-1 font-medium">{lang === 'ne' ? 'थप दिन' : 'Extend Days'}</label>
                  <Input
                    type="number"
                    min="1"
                    required
                    value={assignForm.extendDays}
                    onChange={(e) => setAssignForm({ ...assignForm, extendDays: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAssignSubCoop(null)}>
                {lang === 'ne' ? 'रद्द गर्नुहोस्' : 'Cancel'}
              </Button>
              <Button type="submit" size="sm" disabled={assigningSub}>
                {assigningSub ? '...' : lang === 'ne' ? 'सदस्यता सक्रिय गर्नुहोस्' : 'Assign Plan'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* READ-ONLY PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-mono text-[#78716C]">
                  Read-Only Monitor · SKU {String(selectedProduct.sku)}
                </p>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  {lang === 'ne' ? String(selectedProduct.name_ne) : String(selectedProduct.name_en)}
                </h3>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? String(selectedProduct.cooperative_name_ne || '')
                    : String(selectedProduct.cooperative_name_en || '')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="text-[#78716C] hover:text-[#0F172A] p-1 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#FAF9F6] border border-[#E5E2DC] rounded-lg p-3">
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'मूल्य' : 'Price'}</p>
                <p className="font-semibold text-[#0F172A]">
                  {formatNPR(Number(selectedProduct.discount_price_npr || selectedProduct.price_npr || 0), lang)}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'स्टक' : 'Stock'}</p>
                <p className="font-semibold text-[#0F172A]">
                  {String(selectedProduct.stock_quantity || 0)} {String(selectedProduct.unit_en || '')}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'उपलब्धता' : 'Availability'}</p>
                <p className="font-semibold text-[#0F172A]">
                  {labelFor(STATUS_LABELS, String(selectedProduct.availability_status || 'in_stock'), lang)}
                </p>
              </div>
              <div>
                <p className="text-[#78716C]">{lang === 'ne' ? 'स्थिति' : 'Status'}</p>
                <p className="font-semibold text-[#0F172A]">
                  {labelFor(STATUS_LABELS, String(selectedProduct.status || 'draft'), lang)}
                </p>
              </div>
            </div>

            {Boolean(selectedProduct.short_description_ne || selectedProduct.short_description_en) && (
              <div className="text-xs space-y-1">
                <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'छोटो विवरण' : 'Short Description'}</p>
                <p className="text-[#57534E]">
                  {lang === 'ne'
                    ? String(selectedProduct.short_description_ne || selectedProduct.short_description_en || '')
                    : String(selectedProduct.short_description_en || selectedProduct.short_description_ne || '')}
                </p>
              </div>
            )}

            {Boolean(selectedProduct.description_ne || selectedProduct.description_en) && (
              <div className="text-xs space-y-1">
                <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'विस्तृत विवरण' : 'Full Description'}</p>
                <p className="text-[#57534E] whitespace-pre-line">
                  {lang === 'ne'
                    ? String(selectedProduct.description_ne || selectedProduct.description_en || '')
                    : String(selectedProduct.description_en || selectedProduct.description_ne || '')}
                </p>
              </div>
            )}

            {Boolean(
              selectedProduct.ai_details_json &&
                Array.isArray((selectedProduct.ai_details_json as Record<string, unknown>).highlights) &&
                ((selectedProduct.ai_details_json as Record<string, unknown>).highlights as unknown[]).length > 0
            ) && (
              <div className="text-xs space-y-1">
                <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'मुख्य विशेषताहरू' : 'Key Highlights'}</p>
                <ul className="list-disc pl-4 text-[#57534E] space-y-0.5">
                  {((selectedProduct.ai_details_json as Record<string, unknown>).highlights as string[]).map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(selectedProduct.seo_keywords_json) && selectedProduct.seo_keywords_json.length > 0 && (
              <div className="text-xs space-y-1">
                <p className="font-semibold text-[#0F172A]">SEO Keywords</p>
                <p className="text-[#57534E]">{(selectedProduct.seo_keywords_json as string[]).join(', ')}</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-[#F3F1EC] text-[11px] text-[#78716C]">
              <span>
                {selectedProduct.ai_assisted ? 'AI Assisted Draft Reviewed by Cooperative' : 'Manual Cooperative Listing'}
              </span>
              {Boolean(selectedProduct.slug && selectedProduct.status === 'published') && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/product/${String(selectedProduct.slug)}`)}>
                  {lang === 'ne' ? 'सार्वजनिक पृष्ठमा हेर्नुहोस्' : 'Open Public Page'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={lang === 'ne' ? 'रद्द गर्नुहोस्' : 'Cancel'}
          variant={confirmState.variant}
          requireReason={confirmState.requireReason}
          reasonLabel={confirmState.reasonLabel}
          reasonPlaceholder={confirmState.reasonPlaceholder}
          defaultReason={confirmState.defaultReason}
          loading={confirmLoading}
          onConfirm={runConfirmAction}
          onCancel={() => {
            if (!confirmLoading) setConfirmState(null);
          }}
        />
      )}
    </div>
  );
}
