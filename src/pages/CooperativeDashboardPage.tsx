import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Boxes,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Package,
  Paintbrush,
  Pencil,
  Sparkles,
  ShoppingCart,
  Tag,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { formatDateBS, formatNPR, toNepaliDigits } from '../lib/bs-date';
import { labelFor, STATUS_LABELS } from '../lib/i18n';
import { Input, Select, Textarea } from '../components/ui/input';
import { NepaliInput, NepaliTextarea } from '../components/ui/nepali-input';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/confirm-dialog';
import {
  AiProductAssistantPanel,
  type AiGeneratedPayload,
  type AiHistoryRecord,
  type AiQuotaState,
} from '../components/coop/AiProductAssistantPanel';
import {
  EMPTY_RICH_FIELDS,
  ProductRichFieldsEditor,
  type ProductRichFormFields,
} from '../components/coop/ProductRichFieldsEditor';
import type { ProductAiDetails } from '../components/ProductCard';
import { toast } from 'sonner';

type CoopTab =
  | 'overview'
  | 'store_builder'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'customers'
  | 'reports'
  | 'promotions'
  | 'delivery'
  | 'staff'
  | 'billing'
  | 'support';

export function CooperativeDashboardPage() {
  const { lang, user, navigate, refreshSession } = useApp();
  const [tab, setTab] = useState<CoopTab>('overview');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [otpInput, setOtpInput] = useState('');

  // Store Builder state
  const [storeForm, setStoreForm] = useState<Record<string, unknown> | null>(null);
  const [storeSlug, setStoreSlug] = useState('');
  const [confirmPublishStore, setConfirmPublishStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);

  // Products, Categories & AI Assistant state
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productStatusFilter, setProductStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>('all');
  const [globalCats, setGlobalCats] = useState<Array<{ id: string; slug?: string; name_ne: string; name_en: string }>>([]);
  const [coopCats, setCoopCats] = useState<Array<{ id: string; name_ne: string; name_en: string }>>([]);
  const [aiQuota, setAiQuota] = useState<AiQuotaState | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiModel, setGeminiModel] = useState('');
  const [aiHistory, setAiHistory] = useState<AiHistoryRecord[]>([]);

  const [newProd, setNewProd] = useState({
    nameNe: '',
    nameEn: '',
    sku: '',
    priceNpr: '',
    discountPriceNpr: '',
    unitLabelNe: 'के.जी.',
    unitLabelEn: 'kg',
    stockQuantity: '10',
    lowStockThreshold: '5',
    globalCategoryId: '',
    coopCategoryId: '',
    originDistrict: '',
    producerName: '',
    descriptionNe: '',
    descriptionEn: '',
    status: 'draft',
    isFeatured: false,
    imageBase64: '',
    aiAssisted: false,
    aiGenerationId: '',
    aiConfirmed: false,
  });
  const [newProdRich, setNewProdRich] = useState<ProductRichFormFields>(EMPTY_RICH_FIELDS);
  const [newProdRichExpanded, setNewProdRichExpanded] = useState(false);

  const [editingProd, setEditingProd] = useState<{
    id: string;
    nameNe: string;
    nameEn: string;
    sku: string;
    priceNpr: string;
    discountPriceNpr: string;
    unitLabelNe: string;
    unitLabelEn: string;
    globalCategoryId: string;
    coopCategoryId: string;
    originDistrict: string;
    producerName: string;
    lowStockThreshold: string;
    availabilityStatus: string;
    status: string;
    isFeatured: boolean;
    descriptionNe: string;
    descriptionEn: string;
    imageBase64: string;
    aiAssisted: boolean;
    aiGenerationId: string;
    aiConfirmed: boolean;
    rich: ProductRichFormFields;
  } | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [stockDrafts, setStockDrafts] = useState<Record<string, { delta: string; note: string }>>({});
  const [newCoopCat, setNewCoopCat] = useState({ nameNe: '', nameEn: '' });

  // Confirmation modal targets
  const [deleteProdTarget, setDeleteProdTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletePromoTarget, setDeletePromoTarget] = useState<{ id: string; code: string } | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingOrderCancel, setPendingOrderCancel] = useState<{ orderId: string; status: string } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Inventory, Orders, Customers, Reports
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [reports, setReports] = useState<{
    monthly: Array<{ period: string; orders: number; revenue: number }>;
    productWise: Array<{ sku: string; product_name_ne: string; product_name_en: string; units_sold: number; gross_revenue: number }>;
  }>({ monthly: [], productWise: [] });

  // Promotions, Delivery, Staff, Billing, Support
  const [promotions, setPromotions] = useState<Array<Record<string, unknown>>>([]);
  const [newPromo, setNewPromo] = useState({ code: '', titleNe: '', discountType: 'percentage', discountValue: '10', minOrderNpr: '500' });
  const [deliveryConfig, setDeliveryConfig] = useState<Record<string, unknown> | null>(null);
  const [staffList, setStaffList] = useState<Array<Record<string, unknown>>>([]);
  const [newStaff, setNewStaff] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    staffRole: 'manager',
    manage_products: true,
    manage_orders: true,
    manage_inventory: true,
    manage_store: false,
    view_reports: true,
  });
  const [billing, setBilling] = useState<{
    subscription: Record<string, unknown> | null;
    plans: Array<Record<string, unknown>>;
    payments: Array<Record<string, unknown>>;
  }>({ subscription: null, plans: [], payments: [] });
  const [billingPay, setBillingPay] = useState({ planId: '', billingCycle: 'monthly', paymentMethod: 'bank_transfer', referenceNumber: '' });
  const [notifications, setNotifications] = useState<Array<Record<string, unknown>>>([]);
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [newTicket, setNewTicket] = useState({ subject: '', message: '' });
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});

  const loadOverview = async () => {
    const res = await apiFetch<Record<string, unknown>>('/api/coop-dashboard/overview');
    if (res.ok) setOverview(res.data);
  };

  const loadAiQuotaAndHistory = async () => {
    const [qRes, hRes] = await Promise.all([
      apiFetch<{ quota: AiQuotaState; geminiConfigured: boolean; model: string }>('/api/coop-dashboard/products/ai-quota'),
      apiFetch<{ history: AiHistoryRecord[] }>('/api/coop-dashboard/products/ai-history'),
    ]);
    if (qRes.ok) {
      setAiQuota(qRes.data.quota);
      setGeminiConfigured(Boolean(qRes.data.geminiConfigured));
      setGeminiModel(qRes.data.model || '');
    }
    if (hRes.ok) {
      setAiHistory(hRes.data.history || []);
    }
  };

  const loadOrders = async (statusFilter = orderStatusFilter) => {
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const r = await apiFetch<{ orders: Array<Record<string, unknown>> }>(`/api/coop-dashboard/orders${qs}`);
    if (r.ok) setOrders(r.data.orders);
  };

  useEffect(() => {
    if (user && (user.role === 'cooperative_admin' || user.role === 'cooperative_staff')) {
      loadOverview();
      loadAiQuotaAndHistory();
    }
  }, [user]);

  useEffect(() => {
    if (!user || !['cooperative_admin', 'cooperative_staff'].includes(user.role)) return;
    if (tab === 'store_builder') {
      apiFetch<{ cooperative: { slug: string }; store: Record<string, unknown> }>('/api/coop-dashboard/store').then(
        (r) => {
          if (r.ok) {
            setStoreSlug(r.data.cooperative.slug);
            setStoreForm(r.data.store);
          }
        }
      );
    } else if (tab === 'products') {
      apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products').then((r) => {
        if (r.ok) setProducts(r.data.products);
      });
      apiFetch<{ globalCategories: typeof globalCats; coopCategories: typeof coopCats }>('/api/coop-dashboard/categories').then((r) => {
        if (r.ok) {
          setGlobalCats(r.data.globalCategories);
          setCoopCats(r.data.coopCategories);
        }
      });
      loadAiQuotaAndHistory();
    } else if (tab === 'inventory') {
      apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products').then((r) => {
        if (r.ok) setProducts(r.data.products);
      });
      apiFetch<{ movements: Array<Record<string, unknown>> }>('/api/coop-dashboard/inventory-movements').then((r) => {
        if (r.ok) setMovements(r.data.movements);
      });
    } else if (tab === 'orders') {
      loadOrders();
    } else if (tab === 'customers') {
      apiFetch<{ customers: Array<Record<string, unknown>> }>('/api/coop-dashboard/customers').then((r) => {
        if (r.ok) setCustomers(r.data.customers);
      });
    } else if (tab === 'reports') {
      apiFetch<typeof reports>('/api/coop-dashboard/reports').then((r) => {
        if (r.ok) setReports(r.data);
      });
    } else if (tab === 'promotions') {
      apiFetch<{ promotions: Array<Record<string, unknown>> }>('/api/coop-dashboard/promotions').then((r) => {
        if (r.ok) setPromotions(r.data.promotions);
      });
    } else if (tab === 'delivery') {
      apiFetch<{ config: Record<string, unknown> }>('/api/coop-dashboard/delivery').then((r) => {
        if (r.ok) setDeliveryConfig(r.data.config);
      });
    } else if (tab === 'staff') {
      apiFetch<{ staff: Array<Record<string, unknown>> }>('/api/coop-dashboard/staff').then((r) => {
        if (r.ok) setStaffList(r.data.staff);
      });
    } else if (tab === 'billing') {
      apiFetch<typeof billing>('/api/coop-dashboard/billing').then((r) => {
        if (r.ok) setBilling(r.data);
      });
    } else if (tab === 'support') {
      apiFetch<{ notifications: Array<Record<string, unknown>> }>('/api/coop-dashboard/notifications').then((r) => {
        if (r.ok) setNotifications(r.data.notifications);
      });
      apiFetch<{ tickets: Array<Record<string, unknown>> }>('/api/coop-dashboard/support').then((r) => {
        if (r.ok) setTickets(r.data.tickets);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  if (!user || !['cooperative_admin', 'cooperative_staff'].includes(user.role)) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'सहकारी विक्रेता ड्यासबोर्ड' : 'Cooperative Seller Dashboard'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {lang === 'ne'
            ? 'केवल स्वीकृत वा दर्ता भएका सहकारी खाताले मात्र यो ड्यासबोर्ड प्रयोग गर्न सक्छन्।'
            : 'Only registered cooperative accounts may access this workspace.'}
        </p>
        <div className="flex justify-center gap-3">
          <Button onClick={() => navigate('/login')}>{lang === 'ne' ? 'लगइन' : 'Sign In'}</Button>
          <Button variant="outline" onClick={() => navigate('/register-cooperative')}>
            {lang === 'ne' ? 'सहकारी दर्ता' : 'Register Cooperative'}
          </Button>
        </div>
      </div>
    );
  }

  const coop = overview?.cooperative as Record<string, unknown> | undefined;
  const sub = overview?.subscription as Record<string, unknown> | undefined;
  const metrics = overview?.metrics as Record<string, number> | undefined;
  const productStats = overview?.productStats as Record<string, number> | undefined;
  const lowStockItems = (overview?.lowStockItems as Array<Record<string, unknown>>) || [];
  const recentOrders = (overview?.recentOrders as Array<Record<string, unknown>>) || [];
  const dailySales = (overview?.dailySales as Array<{ day: string; revenue: number; order_count: number }>) || [];

  const handleVerifyCoopOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/cooperatives/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ code: otpInput }),
    });
    if (!res.ok) {
      toast.error(res.error || 'OTP मिलेन।');
      return;
    }
    toast.success(lang === 'ne' ? 'मोबाइल प्रमाणित भयो! अब सुपर एडमिन समीक्षाको प्रतीक्षामा छ।' : 'Phone verified!');
    await refreshSession();
    loadOverview();
  };

  const handleSaveStore = async (publish: boolean) => {
    if (!storeForm) return;
    setSavingStore(true);
    const res = await apiFetch('/api/coop-dashboard/store', {
      method: 'PUT',
      body: JSON.stringify({ ...storeForm, publish }),
    });
    setSavingStore(false);
    if (!res.ok) {
      toast.error(res.error || 'पसल सुरक्षित गर्न सकिएन।');
      return;
    }
    setConfirmPublishStore(false);
    toast.success(
      publish
        ? lang === 'ne'
          ? 'पसल सफलतापूर्वक प्रकाशित भयो!'
          : 'Storefront published live!'
        : lang === 'ne'
        ? 'मस्यौदा सुरक्षित भयो।'
        : 'Draft saved.'
    );
    const r = await apiFetch<{ cooperative: { slug: string }; store: Record<string, unknown> }>('/api/coop-dashboard/store');
    if (r.ok) {
      setStoreSlug(r.data.cooperative.slug);
      setStoreForm(r.data.store);
    }
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    if (!storeForm) return;
    const sections = [...((storeForm.sections as Array<Record<string, unknown>>) || [])];
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    [sections[idx], sections[target]] = [sections[target], sections[idx]];
    setStoreForm({ ...storeForm, sections });
  };

  const buildRichFieldsFromAi = (
    generated: AiGeneratedPayload,
    aiLanguage: 'ne' | 'en',
    currentRich: ProductRichFormFields
  ): ProductRichFormFields => ({
    shortDescriptionNe: generated.short_description_ne || currentRich.shortDescriptionNe,
    shortDescriptionEn: generated.short_description_en || currentRich.shortDescriptionEn,
    aiDetails: {
      product_type_detected: generated.product_type_detected || currentRich.aiDetails.product_type_detected || '',
      highlights: generated.highlights || [],
      known_specifications: generated.known_specifications || [],
      ingredients_or_materials: generated.ingredients_or_materials || [],
      uses_and_benefits: generated.uses_and_benefits || [],
      preparation_or_usage: generated.preparation_or_usage || '',
      recipe_suggestions: generated.recipe_suggestions || [],
      storage_instructions: generated.storage_instructions || '',
      handling_instructions: generated.handling_instructions || '',
      safety_precautions: generated.safety_precautions || '',
      packaging_suggestions: generated.packaging_suggestions || '',
      needs_confirmation: generated.needs_confirmation || [],
    },
    seoTitleNe:
      aiLanguage === 'ne'
        ? generated.seo_title || currentRich.seoTitleNe
        : currentRich.seoTitleNe || generated.refined_name_ne || '',
    seoTitleEn:
      aiLanguage === 'en'
        ? generated.seo_title || currentRich.seoTitleEn
        : currentRich.seoTitleEn || generated.refined_name_en || '',
    seoMetaDescriptionNe:
      aiLanguage === 'ne'
        ? generated.seo_meta_description || currentRich.seoMetaDescriptionNe
        : currentRich.seoMetaDescriptionNe || generated.short_description_ne || '',
    seoMetaDescriptionEn:
      aiLanguage === 'en'
        ? generated.seo_meta_description || currentRich.seoMetaDescriptionEn
        : currentRich.seoMetaDescriptionEn || generated.short_description_en || '',
    seoKeywords: generated.search_keywords || currentRich.seoKeywords || [],
  });

  const handleApplyAiToCreate = ({
    generated,
    generationId,
    suggestedCategoryId,
    language: aiLang,
  }: {
    generated: AiGeneratedPayload;
    generationId?: string;
    suggestedCategoryId?: string;
    language: 'ne' | 'en';
  }) => {
    setNewProd((prev) => ({
      ...prev,
      nameNe: generated.refined_name_ne || prev.nameNe,
      nameEn: generated.refined_name_en || prev.nameEn,
      unitLabelNe: generated.unit_label_ne || prev.unitLabelNe,
      unitLabelEn: generated.unit_label_en || prev.unitLabelEn,
      globalCategoryId: prev.globalCategoryId || suggestedCategoryId || '',
      descriptionNe: generated.detailed_description_ne || prev.descriptionNe,
      descriptionEn: generated.detailed_description_en || prev.descriptionEn,
      aiAssisted: true,
      aiGenerationId: generationId || prev.aiGenerationId,
      aiConfirmed: false,
    }));
    setNewProdRich((prev) => buildRichFieldsFromAi(generated, aiLang, prev));
    setNewProdRichExpanded(true);
  };

  const handleApplyAiToEdit = ({
    generated,
    generationId,
    suggestedCategoryId,
    language: aiLang,
  }: {
    generated: AiGeneratedPayload;
    generationId?: string;
    suggestedCategoryId?: string;
    language: 'ne' | 'en';
  }) => {
    setEditingProd((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        nameNe: generated.refined_name_ne || prev.nameNe,
        nameEn: generated.refined_name_en || prev.nameEn,
        unitLabelNe: generated.unit_label_ne || prev.unitLabelNe,
        unitLabelEn: generated.unit_label_en || prev.unitLabelEn,
        globalCategoryId: prev.globalCategoryId || suggestedCategoryId || '',
        descriptionNe: generated.detailed_description_ne || prev.descriptionNe,
        descriptionEn: generated.detailed_description_en || prev.descriptionEn,
        aiAssisted: true,
        aiGenerationId: generationId || prev.aiGenerationId,
        aiConfirmed: false,
        rich: buildRichFieldsFromAi(generated, aiLang, prev.rich),
      };
    });
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProd.aiAssisted && !newProd.aiConfirmed) {
      toast.error(
        lang === 'ne'
          ? 'कृपया AI बाट तयार भएको विवरण, मूल्य, तौल र मितिहरू जाँच गरी पुष्टि बक्समा चिन्ह लगाउनुहोस्।'
          : 'Please check the review confirmation box to verify AI-drafted product details before saving.'
      );
      return;
    }
    setSavingProduct(true);
    const res = await apiFetch('/api/coop-dashboard/products', {
      method: 'POST',
      body: JSON.stringify({
        ...newProd,
        shortDescriptionNe: newProdRich.shortDescriptionNe,
        shortDescriptionEn: newProdRich.shortDescriptionEn,
        aiDetails: newProdRich.aiDetails,
        seoTitleNe: newProdRich.seoTitleNe,
        seoTitleEn: newProdRich.seoTitleEn,
        seoMetaDescriptionNe: newProdRich.seoMetaDescriptionNe,
        seoMetaDescriptionEn: newProdRich.seoMetaDescriptionEn,
        seoKeywords: newProdRich.seoKeywords,
        priceNpr: Number(newProd.priceNpr),
        discountPriceNpr: newProd.discountPriceNpr ? Number(newProd.discountPriceNpr) : null,
        stockQuantity: Number(newProd.stockQuantity),
        lowStockThreshold: Number(newProd.lowStockThreshold || 5),
      }),
    });
    setSavingProduct(false);
    if (!res.ok) {
      toast.error(res.error || 'उत्पादन थप्न सकिएन।');
      return;
    }
    toast.success(lang === 'ne' ? 'उत्पादन सुरक्षित भयो!' : 'Product added!');
    setNewProd({
      ...newProd,
      nameNe: '',
      nameEn: '',
      sku: '',
      priceNpr: '',
      discountPriceNpr: '',
      producerName: '',
      descriptionNe: '',
      descriptionEn: '',
      isFeatured: false,
      imageBase64: '',
      aiAssisted: false,
      aiGenerationId: '',
      aiConfirmed: false,
    });
    setNewProdRich(EMPTY_RICH_FIELDS);
    setNewProdRichExpanded(false);
    const prodRes = await apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products');
    if (prodRes.ok) setProducts(prodRes.data.products);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProd) return;
    if (editingProd.aiAssisted && !editingProd.aiConfirmed) {
      toast.error(
        lang === 'ne'
          ? 'कृपया AI बाट तयार भएको विवरण जाँच गरी पुष्टि बक्समा चिन्ह लगाउनुहोस्।'
          : 'Please verify AI-drafted fields by checking the confirmation box before saving.'
      );
      return;
    }
    setSavingProduct(true);
    const res = await apiFetch(`/api/coop-dashboard/products/${editingProd.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        nameNe: editingProd.nameNe,
        nameEn: editingProd.nameEn,
        sku: editingProd.sku,
        shortDescriptionNe: editingProd.rich.shortDescriptionNe,
        shortDescriptionEn: editingProd.rich.shortDescriptionEn,
        descriptionNe: editingProd.descriptionNe,
        descriptionEn: editingProd.descriptionEn,
        aiDetails: editingProd.rich.aiDetails,
        seoTitleNe: editingProd.rich.seoTitleNe,
        seoTitleEn: editingProd.rich.seoTitleEn,
        seoMetaDescriptionNe: editingProd.rich.seoMetaDescriptionNe,
        seoMetaDescriptionEn: editingProd.rich.seoMetaDescriptionEn,
        seoKeywords: editingProd.rich.seoKeywords,
        aiAssisted: editingProd.aiAssisted,
        aiGenerationId: editingProd.aiGenerationId || undefined,
        priceNpr: Number(editingProd.priceNpr),
        discountPriceNpr: editingProd.discountPriceNpr === '' ? null : Number(editingProd.discountPriceNpr),
        unitLabelNe: editingProd.unitLabelNe,
        unitLabelEn: editingProd.unitLabelEn,
        globalCategoryId: editingProd.globalCategoryId || null,
        coopCategoryId: editingProd.coopCategoryId || null,
        originDistrict: editingProd.originDistrict,
        producerName: editingProd.producerName,
        lowStockThreshold: Number(editingProd.lowStockThreshold || 5),
        availabilityStatus: editingProd.availabilityStatus,
        status: editingProd.status,
        isFeatured: editingProd.isFeatured,
        imageBase64: editingProd.imageBase64 || undefined,
      }),
    });
    setSavingProduct(false);
    if (!res.ok) {
      toast.error(res.error || 'उत्पादन अद्यावधिक गर्न सकिएन।');
      return;
    }
    toast.success(lang === 'ne' ? 'उत्पादन विवरण सुरक्षित भयो!' : 'Product updated!');
    setEditingProd(null);
    const prodRes = await apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products');
    if (prodRes.ok) setProducts(prodRes.data.products);
  };

  const startEditingProduct = (p: Record<string, unknown>) => {
    const rawAi = (p.ai_details_json as ProductAiDetails) || {};
    const rawKeywords = Array.isArray(p.seo_keywords_json) ? (p.seo_keywords_json as string[]) : [];
    setEditingProd({
      id: String(p.id),
      nameNe: String(p.name_ne || ''),
      nameEn: String(p.name_en || ''),
      sku: String(p.sku || ''),
      priceNpr: String(p.price_npr ?? ''),
      discountPriceNpr: p.discount_price_npr !== null && p.discount_price_npr !== undefined ? String(p.discount_price_npr) : '',
      unitLabelNe: String(p.unit_label_ne || 'के.जी.'),
      unitLabelEn: String(p.unit_label_en || 'kg'),
      globalCategoryId: String(p.global_category_id || ''),
      coopCategoryId: String(p.coop_category_id || ''),
      originDistrict: String(p.origin_district || ''),
      producerName: String(p.producer_name || ''),
      lowStockThreshold: String(p.low_stock_threshold ?? '5'),
      availabilityStatus: String(p.availability_status || 'in_stock'),
      status: String(p.status || 'draft'),
      isFeatured: Boolean(p.is_featured),
      descriptionNe: String(p.description_ne || ''),
      descriptionEn: String(p.description_en || ''),
      imageBase64: '',
      aiAssisted: Boolean(p.ai_assisted),
      aiGenerationId: '',
      aiConfirmed: true,
      rich: {
        shortDescriptionNe: String(p.short_description_ne || ''),
        shortDescriptionEn: String(p.short_description_en || ''),
        aiDetails: {
          highlights: rawAi.highlights || [],
          known_specifications: rawAi.known_specifications || [],
          ingredients_or_materials: rawAi.ingredients_or_materials || [],
          uses_and_benefits: rawAi.uses_and_benefits || [],
          preparation_or_usage: rawAi.preparation_or_usage || '',
          recipe_suggestions: rawAi.recipe_suggestions || [],
          storage_instructions: rawAi.storage_instructions || '',
          handling_instructions: rawAi.handling_instructions || '',
          safety_precautions: rawAi.safety_precautions || '',
          packaging_suggestions: rawAi.packaging_suggestions || '',
          needs_confirmation: rawAi.needs_confirmation || [],
        },
        seoTitleNe: String(p.seo_title_ne || ''),
        seoTitleEn: String(p.seo_title_en || ''),
        seoMetaDescriptionNe: String(p.seo_meta_description_ne || ''),
        seoMetaDescriptionEn: String(p.seo_meta_description_en || ''),
        seoKeywords: rawKeywords,
      },
    });
  };

  const navItems: Array<{ id: CoopTab; ne: string; en: string; icon: React.ReactNode }> = [
    { id: 'overview', ne: 'अवलोकन', en: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'store_builder', ne: 'स्टोर बिल्डर', en: 'Store Builder', icon: <Paintbrush className="w-4 h-4" /> },
    { id: 'products', ne: 'उत्पादन र वर्ग', en: 'Products', icon: <Package className="w-4 h-4" /> },
    { id: 'inventory', ne: 'मौज्दात (Inventory)', en: 'Inventory', icon: <Boxes className="w-4 h-4" /> },
    { id: 'orders', ne: 'अर्डर व्यवस्थापन', en: 'Orders', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'customers', ne: 'ग्राहकहरू', en: 'Customers', icon: <Users className="w-4 h-4" /> },
    { id: 'reports', ne: 'बिक्री प्रतिवेदन', en: 'Sales Reports', icon: <FileText className="w-4 h-4" /> },
    { id: 'promotions', ne: 'कूपन र छुट', en: 'Promotions', icon: <Tag className="w-4 h-4" /> },
    { id: 'delivery', ne: 'डेलिभरी सेटिङ', en: 'Delivery', icon: <Truck className="w-4 h-4" /> },
    { id: 'staff', ne: 'कर्मचारी र अनुमति', en: 'Staff & Roles', icon: <Users className="w-4 h-4" /> },
    { id: 'billing', ne: 'सदस्यता र बिलिङ', en: 'Subscription', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'support', ne: 'सूचना र सहायता', en: 'Support', icon: <HelpCircle className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Sidebar (240px desktop feel) */}
      <aside className="lg:col-span-3 bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-4">
        <div className="pb-3 border-b border-[#E5E2DC]">
          <p className="text-xs text-[#78716C]">{lang === 'ne' ? 'सहकारी पसल' : 'Cooperative Tenant'}</p>
          <p className="font-semibold text-sm text-[#0F172A] truncate">
            {coop ? (lang === 'ne' ? String(coop.name_ne) : String(coop.name_en)) : '...'}
          </p>
          <p className="text-xs mt-1 font-medium text-[#15803D]">
            {coop ? labelFor(STATUS_LABELS, String(coop.status), lang) : ''}
          </p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                tab === item.id ? 'bg-[#0F172A] text-white' : 'text-[#57534E] hover:bg-[#F3F1EC] hover:text-[#0F172A]'
              }`}
            >
              {item.icon}
              <span>{lang === 'ne' ? item.ne : item.en}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="lg:col-span-9 space-y-6">
        {/* Approval / OTP Guard Banner */}
        {coop && coop.status === 'pending_otp' && (
          <form
            onSubmit={handleVerifyCoopOtp}
            className="p-4 rounded-xl border border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="text-xs text-amber-900">
              <p className="font-semibold">{lang === 'ne' ? 'मोबाइल OTP प्रमाणीकरण बाँकी छ' : 'Mobile OTP Verification Pending'}</p>
              <p>{lang === 'ne' ? 'पसल समीक्षाको लागि पठाउन OTP कोड प्रविष्ट गर्नुहोस्।' : 'Enter OTP code to move to admin review.'}</p>
            </div>
            <div className="flex gap-2">
              <Input
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                placeholder="OTP Code"
                className="w-32 h-9 bg-white font-mono"
              />
              <Button type="submit" size="sm">
                {lang === 'ne' ? 'प्रमाणित' : 'Verify'}
              </Button>
            </div>
          </form>
        )}

        {coop && coop.status !== 'approved' && coop.status !== 'pending_otp' && (
          <div className="p-4 rounded-xl border border-[#E5E2DC] bg-white text-xs text-[#57534E]">
            <strong className="text-[#0F172A]">
              {lang === 'ne' ? 'स्थिति:' : 'Status:'} {labelFor(STATUS_LABELS, String(coop.status), lang)}
            </strong>{' '}
            —{' '}
            {lang === 'ne'
              ? 'सुपर एडमिनबाट सहकारी स्वीकृत नभएसम्म उत्पादन प्रकाशित गर्न मिल्दैन। तपाईं मस्यौदा र स्टोर सेटअप तयार गर्न सक्नुहुन्छ।'
              : 'Products cannot be published until Super Admin approves your cooperative.'}
          </div>
        )}

        {/* TAB: OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'कुल बिक्री' : 'Total Sales'}</p>
                <p className="text-xl font-bold text-[#0F172A] tabular-nums mt-1">
                  {formatNPR(metrics?.total_sales || 0, lang)}
                </p>
              </div>
              <div className="bg-white border border-[#E5E2DC] rounded-xl p-4">
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'आजको बिक्री' : "Today's Sales"}</p>
                <p className="text-xl font-bold text-[#15803D] tabular-nums mt-1">
                  {formatNPR(metrics?.today_sales || 0, lang)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab('orders')}
                className="bg-white border border-[#E5E2DC] hover:border-[#B91C1C] rounded-xl p-4 text-left cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'प्रतीक्षारत अर्डर' : 'Pending Orders'}</p>
                <p className="text-xl font-bold text-[#B91C1C] tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(metrics?.pending_orders || 0) : metrics?.pending_orders || 0}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab('products')}
                className="bg-white border border-[#E5E2DC] hover:border-[#0F172A] rounded-xl p-4 text-left cursor-pointer"
              >
                <p className="text-xs text-[#57534E]">{lang === 'ne' ? 'प्रकाशित उत्पादन' : 'Published Products'}</p>
                <p className="text-xl font-bold text-[#0F172A] tabular-nums mt-1">
                  {lang === 'ne' ? toNepaliDigits(productStats?.published_products || 0) : productStats?.published_products || 0}
                </p>
              </button>
            </div>

            {/* AI Daily Quota Banner on Dashboard */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#0F172A]">
                    {lang === 'ne' ? 'आजको निःशुल्क AI उत्पादन सहायक कोटा' : "Today's Free AI Product Assistant Quota"}
                  </p>
                  <p className="text-xs text-[#57534E] tabular-nums">
                    {aiQuota
                      ? lang === 'ne'
                        ? `बाँकी: ${toNepaliDigits(aiQuota.remaining)} / ${toNepaliDigits(aiQuota.limit)} (${aiQuota.dateKtm || 'Asia/Kathmandu'})`
                        : `Remaining: ${aiQuota.remaining} / ${aiQuota.limit} (${aiQuota.dateKtm || 'Asia/Kathmandu'})`
                      : lang === 'ne'
                      ? '२ / २ बाँकी (दैनिक सीमा)'
                      : '2 / 2 daily quota'}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setTab('products')}>
                <Sparkles className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'AI बाट उत्पादन थप्नुहोस्' : 'Add Product with AI'}
              </Button>
            </div>

            {/* 14-day sales chart + Plan summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-4">
                <h2 className="font-semibold text-sm text-[#0F172A]">
                  {lang === 'ne' ? 'पछिल्लो १४ दिनको बिक्री विवरण' : '14-Day Sales Trend'}
                </h2>
                {dailySales.length === 0 ? (
                  <p className="text-xs text-[#78716C] py-8 text-center">
                    {lang === 'ne' ? 'अहिलेसम्म बिक्री डाटा छैन।' : 'No sales recorded in the last 14 days.'}
                  </p>
                ) : (
                  <div className="flex items-end gap-2 h-36 pt-4">
                    {dailySales.map((d) => {
                      const maxRev = Math.max(...dailySales.map((x) => x.revenue), 1);
                      const heightPct = Math.max(8, Math.round((d.revenue / maxRev) * 100));
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-[#B91C1C] rounded-t"
                            style={{ height: `${heightPct}%` }}
                            title={`${d.day}: ${formatNPR(d.revenue, lang)}`}
                          />
                          <span className="text-[10px] text-[#78716C] font-mono">{d.day.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
                <h2 className="font-semibold text-sm text-[#0F172A]">
                  {lang === 'ne' ? 'सक्रिय सदस्यता र स्टक अलर्ट' : 'Plan & Stock Alerts'}
                </h2>
                <div className="text-xs text-[#57534E] space-y-1">
                  <p>
                    {lang === 'ne' ? 'योजना:' : 'Plan:'}{' '}
                    <strong className="text-[#0F172A]">
                      {sub ? (lang === 'ne' ? String(sub.plan_name_ne) : String(sub.plan_name_en)) : 'None'}
                    </strong>
                  </p>
                  {Boolean(sub?.ends_at) && (
                    <p className="tabular-nums">
                      {lang === 'ne' ? 'म्याद:' : 'Valid until:'} {formatDateBS(String(sub?.ends_at), lang)}
                    </p>
                  )}
                </div>
                <div className="pt-2 border-t border-[#E5E2DC] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[#B91C1C]">
                      {lang === 'ne' ? 'कम स्टक चेतावनी' : 'Low Stock Alerts'} ({lowStockItems.length})
                    </p>
                    {lowStockItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTab('inventory')}
                        className="text-[11px] text-[#0F172A] hover:underline cursor-pointer"
                      >
                        {lang === 'ne' ? 'स्टक मिलाउनुहोस्' : 'Restock'}
                      </button>
                    )}
                  </div>
                  {lowStockItems.slice(0, 4).map((item) => (
                    <div key={String(item.id)} className="flex justify-between text-xs">
                      <span className="truncate text-[#57534E]">
                        {lang === 'ne' ? String(item.name_ne) : String(item.name_en)}
                      </span>
                      <span className="font-mono font-bold text-[#B91C1C] tabular-nums">{String(item.stock_quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Orders Summary */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-[#0F172A]">
                  {lang === 'ne' ? 'हालैका अर्डरहरू' : 'Recent Orders'}
                </h2>
                <Button size="sm" variant="outline" onClick={() => setTab('orders')}>
                  {lang === 'ne' ? 'सबै अर्डर हेर्नुहोस्' : 'View All Orders'}
                </Button>
              </div>
              {recentOrders.length === 0 ? (
                <p className="text-xs text-[#78716C]">{lang === 'ne' ? 'कुनै अर्डर छैन।' : 'No recent orders.'}</p>
              ) : (
                <div className="divide-y divide-[#F3F1EC] text-xs">
                  {recentOrders.slice(0, 5).map((ro) => (
                    <div key={String(ro.id)} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-[#78716C] mr-2">{String(ro.order_number)}</span>
                        <span className="font-medium text-[#0F172A]">{String(ro.customer_name)}</span>
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="text-[#15803D]">{labelFor(STATUS_LABELS, String(ro.status), lang)}</span>
                        <span className="font-semibold">{formatNPR(Number(ro.total_npr || 0), lang)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: VISUAL STORE BUILDER */}
        {tab === 'store_builder' && storeForm && (
          <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E2DC] pb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-[#0F172A]">
                  {lang === 'ne' ? 'भिजुअल स्टोर बिल्डर' : 'Visual Storefront Builder'}
                </h2>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? 'सुरक्षित पूर्व-निर्मित विषयवस्तु, रङ, फन्ट र खण्ड क्रम अनुकूलन गर्नुहोस्।'
                    : 'Customize themes, color schemes, fonts, and homepage section order without code.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate(`/store/${storeSlug}?preview=1`)}>
                  <ExternalLink className="w-3.5 h-3.5" />
                  {lang === 'ne' ? 'पूर्वावलोकन' : 'Preview'}
                </Button>
                <Button variant="outline" size="sm" disabled={savingStore} onClick={() => handleSaveStore(false)}>
                  {lang === 'ne' ? 'मस्यौदा सुरक्षित' : 'Save Draft'}
                </Button>
                <Button size="sm" disabled={savingStore} onClick={() => setConfirmPublishStore(true)}>
                  {lang === 'ne' ? 'पसल प्रकाशित गर्नुहोस्' : 'Publish Store'}
                </Button>
              </div>
            </div>

            {Boolean(storeForm.draftConfig) && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                <span>
                  {lang === 'ne'
                    ? 'अप्रकाशित स्टोर मस्यौदा उपलब्ध छ।'
                    : 'An unpublished store draft is saved.'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const draft = storeForm.draftConfig as Record<string, unknown>;
                    setStoreForm({ ...storeForm, ...draft });
                    toast.success(lang === 'ne' ? 'मस्यौदा लोड भयो।' : 'Draft loaded into editor.');
                  }}
                >
                  {lang === 'ne' ? 'मस्यौदा लोड गर्नुहोस्' : 'Load Draft'}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? 'पसलको नाम (नेपाली)' : 'Store Name (Nepali)'}
                </label>
                <Input
                  value={String(storeForm.store_name_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, store_name_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? 'पसलको नाम (English)' : 'Store Name (English)'}
                </label>
                <Input
                  value={String(storeForm.store_name_en || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, store_name_en: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'नारा (नेपाली)' : 'Tagline (Nepali)'}</label>
                <Input
                  value={String(storeForm.tagline_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'नारा (English)' : 'Tagline (English)'}</label>
                <Input
                  value={String(storeForm.tagline_en || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, tagline_en: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'थिम' : 'Theme'}</label>
                <Select
                  value={String(storeForm.theme_key || 'himalayan_stone')}
                  onChange={(e) => setStoreForm({ ...storeForm, theme_key: e.target.value })}
                >
                  <option value="himalayan_stone">Himalayan Stone</option>
                  <option value="ilam_emerald">Ilam Emerald</option>
                  <option value="palpa_crimson">Palpa Crimson</option>
                  <option value="mustang_slate">Mustang Slate</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'फन्ट' : 'Approved Font'}</label>
                <Select
                  value={String(storeForm.font_key || 'noto_jakarta')}
                  onChange={(e) => setStoreForm({ ...storeForm, font_key: e.target.value })}
                >
                  <option value="noto_jakarta">Noto + Jakarta Sans</option>
                  <option value="serif_editorial">Editorial Serif</option>
                  <option value="modern_outfit">Modern Outfit</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'मुख्य रङ' : 'Primary Color'}</label>
                <Input
                  type="color"
                  value={String(storeForm.primary_color || '#B91C1C')}
                  onChange={(e) => setStoreForm({ ...storeForm, primary_color: e.target.value })}
                  className="h-10 p-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सहायक रङ' : 'Accent Color'}</label>
                <Input
                  type="color"
                  value={String(storeForm.accent_color || '#15803D')}
                  onChange={(e) => setStoreForm({ ...storeForm, accent_color: e.target.value })}
                  className="h-10 p-1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'कस्टम डोमेन (ऐच्छिक)' : 'Custom Domain'}</label>
                <Input
                  value={String(storeForm.custom_domain || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, custom_domain: e.target.value })}
                  placeholder="shop.yourcoop.org.np"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पसल लोगो अपलोड' : 'Upload Store Logo'}</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setStoreForm({ ...storeForm, logoBase64: String(reader.result || '') });
                    reader.readAsDataURL(file);
                  }}
                  className="text-xs text-[#57534E]"
                />
                {Boolean(storeForm.logoBase64) && (
                  <p className="text-[11px] text-[#15803D] mt-1">{lang === 'ne' ? 'नयाँ लोगो चयन भयो' : 'New logo selected'}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'ब्यानर फोटो अपलोड' : 'Upload Store Banner'}</label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setStoreForm({ ...storeForm, bannerBase64: String(reader.result || '') });
                    reader.readAsDataURL(file);
                  }}
                  className="text-xs text-[#57534E]"
                />
                {Boolean(storeForm.bannerBase64) && (
                  <p className="text-[11px] text-[#15803D] mt-1">{lang === 'ne' ? 'नयाँ ब्यानर चयन भयो' : 'New banner selected'}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सम्पर्क फोन' : 'Contact Phone'}</label>
                <Input
                  value={String(storeForm.contact_phone || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, contact_phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सम्पर्क इमेल' : 'Contact Email'}</label>
                <Input
                  type="email"
                  value={String(storeForm.contact_email || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, contact_email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पसल ठेगाना' : 'Store Address'}</label>
                <Input
                  value={String(storeForm.address_text || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, address_text: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सहकारी परिचय' : 'Introduction'}</label>
                <Textarea
                  value={String(storeForm.intro_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, intro_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'लक्ष्य / उद्देश्य (Mission)' : 'Mission'}</label>
                <Textarea
                  value={String(storeForm.mission_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, mission_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'दूरदृष्टि (Vision)' : 'Vision'}</label>
                <Textarea
                  value={String(storeForm.vision_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, vision_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सूचना तथा घोषणा' : 'Store Notice'}</label>
                <Input
                  value={String(storeForm.notice_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, notice_ne: e.target.value })}
                />
                <label className="block text-xs font-medium mt-3 mb-1">{lang === 'ne' ? 'फुटर जानकारी' : 'Footer Text'}</label>
                <Input
                  value={String(storeForm.footer_text_ne || '')}
                  onChange={(e) => setStoreForm({ ...storeForm, footer_text_ne: e.target.value })}
                />
              </div>
            </div>

            {/* Section Arrangement */}
            <div className="space-y-2 pt-2 border-t border-[#E5E2DC]">
              <h3 className="text-xs font-semibold text-[#0F172A]">
                {lang === 'ne' ? 'होमपेज खण्ड क्रम र दृश्यता' : 'Homepage Sections Order'}
              </h3>
              <div className="space-y-2">
                {((storeForm.sections as Array<{ id: string; type: string; visible: boolean; title_ne: string; title_en: string }>) || []).map(
                  (sec, idx) => (
                    <div
                      key={sec.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6]"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={sec.visible}
                          onChange={(e) => {
                            const next = [...((storeForm.sections as Array<Record<string, unknown>>) || [])];
                            next[idx] = { ...sec, visible: e.target.checked };
                            setStoreForm({ ...storeForm, sections: next });
                          }}
                        />
                        <span className="text-xs font-medium text-[#0F172A]">
                          {sec.type} — {lang === 'ne' ? sec.title_ne : sec.title_en}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => moveSection(idx, -1)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => moveSection(idx, 1)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PRODUCTS */}
        {tab === 'products' && (
          <div className="space-y-6">
            <form onSubmit={handleCreateProduct} className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-base text-[#0F172A]">
                  {lang === 'ne' ? 'नयाँ उत्पादन थप्नुहोस्' : 'Add New Product'}
                </h2>
                <span className="text-xs text-[#57534E]">
                  {lang === 'ne'
                    ? 'नाम लेखेर "AI बाट विवरण बनाउनुहोस्" थिच्नुहोस् वा म्यानुअल भर्नुहोस्।'
                    : 'Enter product name and click "Generate with AI", or fill manually.'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <NepaliInput
                  required
                  defaultAutoNepali={true}
                  placeholder={lang === 'ne' ? 'नेपाली नाम *' : 'Nepali Name *'}
                  value={newProd.nameNe}
                  onValueChange={(val) => setNewProd((prev) => ({ ...prev, nameNe: val }))}
                />
                <Input
                  required
                  placeholder={lang === 'ne' ? 'English Name *' : 'English Name *'}
                  value={newProd.nameEn}
                  onChange={(e) => setNewProd({ ...newProd, nameEn: e.target.value })}
                />
                <Input
                  required
                  placeholder="SKU (e.g. COOP-001) *"
                  value={newProd.sku}
                  onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                />
              </div>

              <AiProductAssistantPanel
                lang={lang}
                mode="create"
                productName={newProd.nameNe.trim() || newProd.nameEn.trim()}
                unitHint={newProd.unitLabelNe || newProd.unitLabelEn}
                quota={aiQuota}
                geminiConfigured={geminiConfigured}
                modelName={geminiModel}
                history={aiHistory}
                globalCategories={globalCats}
                needsConfirmation={newProdRich.aiDetails.needs_confirmation || []}
                onApplyGenerated={handleApplyAiToCreate}
                onQuotaUpdate={setAiQuota}
                onRefreshHistory={loadAiQuotaAndHistory}
              />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Input
                  required
                  type="number"
                  placeholder={lang === 'ne' ? 'मूल्य (रु.) *' : 'Price NPR *'}
                  value={newProd.priceNpr}
                  onChange={(e) => setNewProd({ ...newProd, priceNpr: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder={lang === 'ne' ? 'छुट मूल्य' : 'Discount NPR'}
                  value={newProd.discountPriceNpr}
                  onChange={(e) => setNewProd({ ...newProd, discountPriceNpr: e.target.value })}
                />
                <Input
                  required
                  type="number"
                  placeholder={lang === 'ne' ? 'स्टक संख्या *' : 'Stock Qty *'}
                  value={newProd.stockQuantity}
                  onChange={(e) => setNewProd({ ...newProd, stockQuantity: e.target.value })}
                />
                <Select
                  value={newProd.globalCategoryId}
                  onChange={(e) => setNewProd({ ...newProd, globalCategoryId: e.target.value })}
                >
                  <option value="">{lang === 'ne' ? 'मुख्य वर्ग छान्नुहोस्' : 'Select Category'}</option>
                  {globalCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'ne' ? c.name_ne : c.name_en}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input
                  placeholder={lang === 'ne' ? 'एकाइ (जस्तै: १ के.जी.)' : 'Unit (e.g. 1 kg)'}
                  value={newProd.unitLabelNe}
                  onChange={(e) => setNewProd({ ...newProd, unitLabelNe: e.target.value, unitLabelEn: e.target.value })}
                />
                <Select
                  value={newProd.coopCategoryId}
                  onChange={(e) => setNewProd({ ...newProd, coopCategoryId: e.target.value })}
                >
                  <option value="">{lang === 'ne' ? 'पसल आन्तरिक वर्ग' : 'Store Category (Optional)'}</option>
                  {coopCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'ne' ? c.name_ne : c.name_en}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder={lang === 'ne' ? 'उत्पादन जिल्ला' : 'Origin District'}
                  value={newProd.originDistrict}
                  onChange={(e) => setNewProd({ ...newProd, originDistrict: e.target.value })}
                />
                <Select value={newProd.status} onChange={(e) => setNewProd({ ...newProd, status: e.target.value })}>
                  <option value="draft">{lang === 'ne' ? 'मस्यौदा (Draft)' : 'Draft'}</option>
                  <option value="published">{lang === 'ne' ? 'प्रकाशित (Publish)' : 'Publish'}</option>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                <Input
                  placeholder={lang === 'ne' ? 'उत्पादक / कृषक समूह नाम' : 'Producer / Farmer Group'}
                  value={newProd.producerName}
                  onChange={(e) => setNewProd({ ...newProd, producerName: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder={lang === 'ne' ? 'न्यूनतम स्टक चेतावनी (५)' : 'Low Stock Alert Threshold (5)'}
                  value={newProd.lowStockThreshold}
                  onChange={(e) => setNewProd({ ...newProd, lowStockThreshold: e.target.value })}
                />
                <label className="inline-flex items-center gap-2 text-xs text-[#0F172A]">
                  <input
                    type="checkbox"
                    checked={newProd.isFeatured}
                    onChange={(e) => setNewProd({ ...newProd, isFeatured: e.target.checked })}
                  />
                  <span>{lang === 'ne' ? 'सहकारी पसलमा विशेष उत्पादन बनाउनुहोस्' : 'Feature on Storefront'}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NepaliTextarea
                  defaultAutoNepali={true}
                  placeholder={lang === 'ne' ? 'विस्तृत विवरण (नेपाली)' : 'Detailed description (Nepali)'}
                  value={newProd.descriptionNe}
                  onValueChange={(val) => setNewProd((prev) => ({ ...prev, descriptionNe: val }))}
                />
                <Textarea
                  placeholder={lang === 'ne' ? 'विस्तृत विवरण (English)' : 'Detailed description (English)'}
                  value={newProd.descriptionEn}
                  onChange={(e) => setNewProd({ ...newProd, descriptionEn: e.target.value })}
                />
              </div>

              <ProductRichFieldsEditor
                key={newProdRichExpanded ? 'new-expanded' : 'new-collapsed'}
                lang={lang}
                value={newProdRich}
                onChange={setNewProdRich}
                defaultExpanded={newProdRichExpanded}
              />

              {newProd.aiAssisted && (
                <label className="flex items-start gap-2 p-3 rounded-lg bg-red-50/70 border border-red-200 text-xs text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newProd.aiConfirmed}
                    onChange={(e) => setNewProd({ ...newProd, aiConfirmed: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    {lang === 'ne'
                      ? 'मैले AI बाट तयार भएको सबै विवरण, मूल्य, एकाइ/तौल, सामग्री र दाबीहरू समीक्षा गरी प्रमाणित गरेको छु।'
                      : 'I confirm that I have reviewed and verified all AI-generated details, pricing, net weights, ingredients, and claims before saving/publishing.'}
                  </span>
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setNewProd({ ...newProd, imageBase64: String(reader.result || '') });
                    reader.readAsDataURL(file);
                  }}
                  className="text-xs text-[#57534E]"
                />
                <Button type="submit" disabled={savingProduct}>
                  {savingProduct
                    ? lang === 'ne'
                      ? 'सुरक्षित हुँदैछ...'
                      : 'Saving...'
                    : lang === 'ne'
                    ? 'उत्पादन सुरक्षित गर्नुहोस्'
                    : 'Save Product'}
                </Button>
              </div>
            </form>

            {/* Cooperative Categories quick manager */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm">{lang === 'ne' ? 'सहकारी आन्तरिक वर्गहरू' : 'Store Categories'}</h3>
              <div className="flex flex-wrap gap-2">
                {coopCats.map((c) => (
                  <span
                    key={c.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#E5E2DC] bg-[#FAF9F6] inline-flex items-center gap-2"
                  >
                    <span>{lang === 'ne' ? c.name_ne : c.name_en}</span>
                    <button
                      type="button"
                      aria-label={lang === 'ne' ? 'वर्ग हटाउनुहोस्' : 'Delete category'}
                      onClick={() =>
                        setDeleteCatTarget({ id: c.id, name: lang === 'ne' ? c.name_ne : c.name_en })
                      }
                      className="text-[#78716C] hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 max-w-lg items-start">
                <div className="flex-1 min-w-[160px]">
                  <NepaliInput
                    defaultAutoNepali={true}
                    placeholder={lang === 'ne' ? 'नेपाली वर्ग नाम' : 'Nepali name'}
                    value={newCoopCat.nameNe}
                    onValueChange={(val) => setNewCoopCat((prev) => ({ ...prev, nameNe: val }))}
                  />
                </div>
                <Input
                  placeholder="English name"
                  value={newCoopCat.nameEn}
                  onChange={(e) => setNewCoopCat({ ...newCoopCat, nameEn: e.target.value })}
                  className="flex-1 min-w-[140px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const res = await apiFetch('/api/coop-dashboard/categories', {
                      method: 'POST',
                      body: JSON.stringify(newCoopCat),
                    });
                    if (!res.ok) {
                      toast.error(res.error || (lang === 'ne' ? 'वर्ग थप्न सकिएन।' : 'Failed to add category.'));
                      return;
                    }
                    toast.success(lang === 'ne' ? 'नयाँ वर्ग थपियो।' : 'Category added.');
                    setNewCoopCat({ nameNe: '', nameEn: '' });
                    const r = await apiFetch<{ coopCategories: typeof coopCats }>('/api/coop-dashboard/categories');
                    if (r.ok) setCoopCats(r.data.coopCategories);
                  }}
                >
                  {lang === 'ne' ? 'थप्नुहोस्' : 'Add'}
                </Button>
              </div>
            </div>

            {/* Inline Edit Product Panel */}
            {editingProd && (
              <form
                onSubmit={handleUpdateProduct}
                className="bg-[#FAF9F6] border-2 border-[#0F172A] rounded-xl p-6 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-base text-[#0F172A]">
                    {lang === 'ne' ? 'उत्पादन विवरण सम्पादन' : 'Edit Product Details'} —{' '}
                    <span className="font-mono text-xs">{editingProd.sku}</span>
                  </h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingProd(null)}>
                    {lang === 'ne' ? 'बन्द गर्नुहोस्' : 'Cancel'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <NepaliInput
                    required
                    defaultAutoNepali={true}
                    placeholder={lang === 'ne' ? 'नेपाली नाम *' : 'Nepali Name *'}
                    value={editingProd.nameNe}
                    onValueChange={(val) => setEditingProd((prev) => (prev ? { ...prev, nameNe: val } : prev))}
                  />
                  <Input
                    required
                    placeholder={lang === 'ne' ? 'English Name *' : 'English Name *'}
                    value={editingProd.nameEn}
                    onChange={(e) => setEditingProd({ ...editingProd, nameEn: e.target.value })}
                  />
                  <Input
                    required
                    placeholder="SKU *"
                    value={editingProd.sku}
                    onChange={(e) => setEditingProd({ ...editingProd, sku: e.target.value })}
                  />
                </div>

                <AiProductAssistantPanel
                  lang={lang}
                  mode="edit"
                  productId={editingProd.id}
                  productName={editingProd.nameNe.trim() || editingProd.nameEn.trim()}
                  unitHint={editingProd.unitLabelNe || editingProd.unitLabelEn}
                  quota={aiQuota}
                  geminiConfigured={geminiConfigured}
                  modelName={geminiModel}
                  history={aiHistory}
                  globalCategories={globalCats}
                  needsConfirmation={editingProd.rich.aiDetails.needs_confirmation || []}
                  onApplyGenerated={handleApplyAiToEdit}
                  onQuotaUpdate={setAiQuota}
                  onRefreshHistory={loadAiQuotaAndHistory}
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Input
                    required
                    type="number"
                    placeholder={lang === 'ne' ? 'मूल्य (रु.) *' : 'Price NPR *'}
                    value={editingProd.priceNpr}
                    onChange={(e) => setEditingProd({ ...editingProd, priceNpr: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder={lang === 'ne' ? 'छुट मूल्य (रु.)' : 'Discount NPR'}
                    value={editingProd.discountPriceNpr}
                    onChange={(e) => setEditingProd({ ...editingProd, discountPriceNpr: e.target.value })}
                  />
                  <Input
                    placeholder={lang === 'ne' ? 'एकाइ (नेपाली)' : 'Unit (Nepali)'}
                    value={editingProd.unitLabelNe}
                    onChange={(e) => setEditingProd({ ...editingProd, unitLabelNe: e.target.value })}
                  />
                  <Input
                    placeholder={lang === 'ne' ? 'एकाइ (English)' : 'Unit (English)'}
                    value={editingProd.unitLabelEn}
                    onChange={(e) => setEditingProd({ ...editingProd, unitLabelEn: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <Select
                    value={editingProd.globalCategoryId}
                    onChange={(e) => setEditingProd({ ...editingProd, globalCategoryId: e.target.value })}
                  >
                    <option value="">{lang === 'ne' ? 'मुख्य वर्ग' : 'Global Category'}</option>
                    {globalCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === 'ne' ? c.name_ne : c.name_en}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={editingProd.coopCategoryId}
                    onChange={(e) => setEditingProd({ ...editingProd, coopCategoryId: e.target.value })}
                  >
                    <option value="">{lang === 'ne' ? 'पसल आन्तरिक वर्ग' : 'Store Category'}</option>
                    {coopCats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {lang === 'ne' ? c.name_ne : c.name_en}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={editingProd.availabilityStatus}
                    onChange={(e) => setEditingProd({ ...editingProd, availabilityStatus: e.target.value })}
                  >
                    <option value="in_stock">{labelFor(STATUS_LABELS, 'in_stock', lang)}</option>
                    <option value="out_of_stock">{labelFor(STATUS_LABELS, 'out_of_stock', lang)}</option>
                    <option value="preorder">{labelFor(STATUS_LABELS, 'preorder', lang)}</option>
                    <option value="discontinued">{labelFor(STATUS_LABELS, 'discontinued', lang)}</option>
                  </Select>
                  <Select
                    value={editingProd.status}
                    onChange={(e) => setEditingProd({ ...editingProd, status: e.target.value })}
                  >
                    <option value="draft">{labelFor(STATUS_LABELS, 'draft', lang)}</option>
                    <option value="published">{labelFor(STATUS_LABELS, 'published', lang)}</option>
                    <option value="archived">{labelFor(STATUS_LABELS, 'archived', lang)}</option>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
                  <Input
                    placeholder={lang === 'ne' ? 'उत्पादन जिल्ला' : 'Origin District'}
                    value={editingProd.originDistrict}
                    onChange={(e) => setEditingProd({ ...editingProd, originDistrict: e.target.value })}
                  />
                  <Input
                    placeholder={lang === 'ne' ? 'उत्पादक / कृषक समूह' : 'Producer Name'}
                    value={editingProd.producerName}
                    onChange={(e) => setEditingProd({ ...editingProd, producerName: e.target.value })}
                  />
                  <Input
                    type="number"
                    placeholder={lang === 'ne' ? 'न्यूनतम स्टक चेतावनी' : 'Low Stock Threshold'}
                    value={editingProd.lowStockThreshold}
                    onChange={(e) => setEditingProd({ ...editingProd, lowStockThreshold: e.target.value })}
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-[#0F172A]">
                    <input
                      type="checkbox"
                      checked={editingProd.isFeatured}
                      onChange={(e) => setEditingProd({ ...editingProd, isFeatured: e.target.checked })}
                    />
                    <span>{lang === 'ne' ? 'विशेष उत्पादन (Store Featured)' : 'Feature in Storefront'}</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NepaliTextarea
                    defaultAutoNepali={true}
                    placeholder={lang === 'ne' ? 'विवरण (नेपाली)' : 'Description (Nepali)'}
                    value={editingProd.descriptionNe}
                    onValueChange={(val) => setEditingProd((prev) => (prev ? { ...prev, descriptionNe: val } : prev))}
                  />
                  <Textarea
                    placeholder={lang === 'ne' ? 'विवरण (English)' : 'Description (English)'}
                    value={editingProd.descriptionEn}
                    onChange={(e) => setEditingProd({ ...editingProd, descriptionEn: e.target.value })}
                  />
                </div>

                <ProductRichFieldsEditor
                  key={`edit-${editingProd.id}-${editingProd.aiGenerationId || 'base'}`}
                  lang={lang}
                  value={editingProd.rich}
                  onChange={(rich) => setEditingProd({ ...editingProd, rich })}
                  defaultExpanded={Boolean(
                    editingProd.aiGenerationId ||
                      editingProd.rich.shortDescriptionNe ||
                      (editingProd.rich.aiDetails.highlights && editingProd.rich.aiDetails.highlights.length > 0)
                  )}
                />

                {editingProd.aiAssisted && (
                  <label className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-[#0F172A] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProd.aiConfirmed}
                      onChange={(e) => setEditingProd({ ...editingProd, aiConfirmed: e.target.checked })}
                      className="mt-0.5"
                    />
                    <span>
                      {lang === 'ne'
                        ? 'मैले अद्यावधिक गरिएको AI विवरण र प्रमाणिकरण बुँदाहरू जाँच गरी पुष्टि गरेको छु।'
                        : 'I confirm that I have reviewed and verified all AI-generated updates before saving.'}
                    </span>
                  </label>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-[#57534E]">
                    <span>{lang === 'ne' ? 'नयाँ फोटो (ऐच्छिक):' : 'Replace Photo (Optional):'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !editingProd) return;
                        const reader = new FileReader();
                        reader.onload = () => setEditingProd({ ...editingProd, imageBase64: String(reader.result || '') });
                        reader.readAsDataURL(file);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingProd(null)}>
                      {lang === 'ne' ? 'रद्द' : 'Cancel'}
                    </Button>
                    <Button type="submit" disabled={savingProduct}>
                      {savingProduct
                        ? lang === 'ne'
                          ? 'सुरक्षित हुँदै...'
                          : 'Saving...'
                        : lang === 'ne'
                        ? 'परिवर्तन सुरक्षित गर्नुहोस्'
                        : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* Product List Table with Search & Status Filter */}
            <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#E5E2DC] bg-[#FAF9F6] flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-sm text-[#0F172A]">
                  {lang === 'ne' ? 'सहकारी उत्पादन सूची' : 'Cooperative Product Catalog'} ({products.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder={lang === 'ne' ? 'नाम वा SKU खोज्नुहोस्...' : 'Search product or SKU...'}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="h-9 text-xs bg-white w-52"
                  />
                  <Select
                    value={productStatusFilter}
                    onChange={(e) => setProductStatusFilter(e.target.value as 'all' | 'published' | 'draft' | 'archived')}
                    className="h-9 text-xs bg-white w-36"
                  >
                    <option value="all">{lang === 'ne' ? 'सबै स्थिति' : 'All Statuses'}</option>
                    <option value="published">{labelFor(STATUS_LABELS, 'published', lang)}</option>
                    <option value="draft">{labelFor(STATUS_LABELS, 'draft', lang)}</option>
                    <option value="archived">{labelFor(STATUS_LABELS, 'archived', lang)}</option>
                  </Select>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E2DC] text-left text-xs text-[#78716C]">
                      <th className="p-3">{lang === 'ne' ? 'उत्पादन' : 'Product'}</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3 text-right">{lang === 'ne' ? 'मूल्य' : 'Price'}</th>
                      <th className="p-3 text-right">{lang === 'ne' ? 'स्टक' : 'Stock'}</th>
                      <th className="p-3">{lang === 'ne' ? 'उपलब्धता' : 'Availability'}</th>
                      <th className="p-3">{lang === 'ne' ? 'स्थिति' : 'Status'}</th>
                      <th className="p-3 text-right">{lang === 'ne' ? 'कार्य' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F1EC]">
                    {products
                      .filter((p) => {
                        if (productStatusFilter !== 'all' && String(p.status) !== productStatusFilter) return false;
                        const q = productSearch.trim().toLowerCase();
                        if (!q) return true;
                        return [p.name_ne, p.name_en, p.sku]
                          .map((v) => String(v || '').toLowerCase())
                          .some((v) => v.includes(q));
                      })
                      .map((p) => (
                        <tr key={String(p.id)}>
                          <td className="p-3 font-medium text-[#0F172A]">
                            <p>{lang === 'ne' ? String(p.name_ne) : String(p.name_en)}</p>
                            <p className="text-xs text-[#78716C]">
                              {lang === 'ne' ? String(p.unit_label_ne || '') : String(p.unit_label_en || '')}
                              {Boolean(p.ai_assisted) && ' · AI'}
                            </p>
                          </td>
                          <td className="p-3 font-mono text-xs text-[#57534E]">{String(p.sku)}</td>
                          <td className="p-3 text-right tabular-nums">
                            {p.discount_price_npr ? (
                              <div>
                                <span className="font-semibold text-[#0F172A]">
                                  {formatNPR(Number(p.discount_price_npr), lang)}
                                </span>
                                <span className="block text-xs line-through text-[#78716C]">
                                  {formatNPR(Number(p.price_npr), lang)}
                                </span>
                              </div>
                            ) : (
                              formatNPR(Number(p.price_npr), lang)
                            )}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {lang === 'ne' ? toNepaliDigits(Number(p.stock_quantity || 0)) : String(p.stock_quantity)}
                          </td>
                          <td className="p-3 text-xs text-[#57534E]">
                            {labelFor(STATUS_LABELS, String(p.availability_status || 'in_stock'), lang)}
                          </td>
                          <td className="p-3 text-xs">{labelFor(STATUS_LABELS, String(p.status), lang)}</td>
                          <td className="p-3 text-right">
                            <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                              {Boolean(p.slug) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  title={lang === 'ne' ? 'उत्पादन पृष्ठ हेर्नुहोस्' : 'View Product'}
                                  onClick={() => navigate(`/product/${String(p.slug)}`)}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => startEditingProduct(p)}>
                                <Pencil className="w-3.5 h-3.5" />
                                {lang === 'ne' ? 'सम्पादन' : 'Edit'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  const nextStatus = p.status === 'published' ? 'draft' : 'published';
                                  const r = await apiFetch(`/api/coop-dashboard/products/${p.id}`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: nextStatus }),
                                  });
                                  if (!r.ok) {
                                    toast.error(r.error || 'स्थिति परिवर्तन असफल');
                                    return;
                                  }
                                  toast.success(
                                    nextStatus === 'published'
                                      ? lang === 'ne'
                                        ? 'उत्पादन प्रकाशित भयो।'
                                        : 'Product published.'
                                      : lang === 'ne'
                                      ? 'उत्पादन मस्यौदामा सारियो।'
                                      : 'Moved to draft.'
                                  );
                                  const ref = await apiFetch<{ products: Array<Record<string, unknown>> }>(
                                    '/api/coop-dashboard/products'
                                  );
                                  if (ref.ok) setProducts(ref.data.products);
                                }}
                              >
                                {p.status === 'published'
                                  ? lang === 'ne'
                                    ? 'मस्यौदा'
                                    : 'Unpublish'
                                  : lang === 'ne'
                                  ? 'प्रकाशित'
                                  : 'Publish'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title={lang === 'ne' ? 'हटाउनुहोस् / आर्काइभ' : 'Delete / Archive'}
                                onClick={() =>
                                  setDeleteProdTarget({
                                    id: String(p.id),
                                    name: lang === 'ne' ? String(p.name_ne) : String(p.name_en),
                                  })
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: INVENTORY */}
        {tab === 'inventory' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <h2 className="font-semibold text-base">
                {lang === 'ne' ? 'स्टक र उपलब्धता व्यवस्थापन' : 'Stock & Availability Management'}
              </h2>
              <div className="space-y-3">
                {products.map((p) => {
                  const id = String(p.id);
                  const draft = stockDrafts[id] || { delta: '', note: '' };
                  return (
                    <div
                      key={id}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-3 border-b border-[#F3F1EC] text-sm"
                    >
                      <div>
                        <span className="font-medium">{lang === 'ne' ? String(p.name_ne) : String(p.name_en)}</span>
                        <span className="ml-2 text-xs font-mono text-[#78716C]">{String(p.sku)}</span>
                        <p className="text-xs tabular-nums font-semibold text-[#0F172A] mt-0.5">
                          {lang === 'ne'
                            ? `हालको मौज्दात: ${toNepaliDigits(Number(p.stock_quantity))}`
                            : `Current Qty: ${p.stock_quantity}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={String(p.availability_status || 'in_stock')}
                          onChange={async (e) => {
                            const r = await apiFetch(`/api/coop-dashboard/products/${p.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ availabilityStatus: e.target.value }),
                            });
                            if (!r.ok) {
                              toast.error(r.error || 'उपलब्धता परिवर्तन असफल');
                              return;
                            }
                            toast.success(lang === 'ne' ? 'उपलब्धता अद्यावधिक भयो' : 'Availability updated');
                            const pRes = await apiFetch<{ products: Array<Record<string, unknown>> }>(
                              '/api/coop-dashboard/products'
                            );
                            if (pRes.ok) setProducts(pRes.data.products);
                          }}
                          className="w-36 h-8 text-xs"
                        >
                          <option value="in_stock">{labelFor(STATUS_LABELS, 'in_stock', lang)}</option>
                          <option value="out_of_stock">{labelFor(STATUS_LABELS, 'out_of_stock', lang)}</option>
                          <option value="preorder">{labelFor(STATUS_LABELS, 'preorder', lang)}</option>
                          <option value="discontinued">{labelFor(STATUS_LABELS, 'discontinued', lang)}</option>
                        </Select>

                        <Input
                          type="number"
                          placeholder="+/- Qty"
                          value={draft.delta}
                          onChange={(e) =>
                            setStockDrafts((prev) => ({
                              ...prev,
                              [id]: { ...draft, delta: e.target.value },
                            }))
                          }
                          className="w-24 h-8 text-xs font-mono"
                        />
                        <Input
                          placeholder={lang === 'ne' ? 'कारण / टिप्पणी' : 'Adjustment note'}
                          value={draft.note}
                          onChange={(e) =>
                            setStockDrafts((prev) => ({
                              ...prev,
                              [id]: { ...draft, note: e.target.value },
                            }))
                          }
                          className="w-40 h-8 text-xs"
                        />
                        <Button
                          size="sm"
                          onClick={async () => {
                            const qtyDelta = Math.floor(Number(draft.delta));
                            if (!qtyDelta) {
                              toast.error(lang === 'ne' ? 'मान्य +/- संख्या प्रविष्ट गर्नुहोस्।' : 'Enter a valid non-zero delta.');
                              return;
                            }
                            const r = await apiFetch(`/api/coop-dashboard/products/${p.id}/adjust-stock`, {
                              method: 'POST',
                              body: JSON.stringify({
                                delta: qtyDelta,
                                movementType: qtyDelta > 0 ? 'restock' : 'adjustment',
                                note: draft.note || (qtyDelta > 0 ? 'Stock restock' : 'Manual adjustment'),
                              }),
                            });
                            if (!r.ok) {
                              toast.error(r.error || 'स्टक समायोजन असफल');
                              return;
                            }
                            toast.success(lang === 'ne' ? 'स्टक अद्यावधिक भयो' : 'Stock adjusted');
                            setStockDrafts((prev) => ({ ...prev, [id]: { delta: '', note: '' } }));
                            const [pRes, mRes] = await Promise.all([
                              apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products'),
                              apiFetch<{ movements: Array<Record<string, unknown>> }>('/api/coop-dashboard/inventory-movements'),
                            ]);
                            if (pRes.ok) setProducts(pRes.data.products);
                            if (mRes.ok) setMovements(mRes.data.movements);
                          }}
                        >
                          {lang === 'ne' ? 'लागू गर्नुहोस्' : 'Apply'}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const r = await apiFetch(`/api/coop-dashboard/products/${p.id}/adjust-stock`, {
                              method: 'POST',
                              body: JSON.stringify({ delta: 10, movementType: 'restock', note: 'Quick +10 restock' }),
                            });
                            if (!r.ok) {
                              toast.error(r.error || 'स्टक समायोजन असफल');
                              return;
                            }
                            const [pRes, mRes] = await Promise.all([
                              apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products'),
                              apiFetch<{ movements: Array<Record<string, unknown>> }>('/api/coop-dashboard/inventory-movements'),
                            ]);
                            if (pRes.ok) setProducts(pRes.data.products);
                            if (mRes.ok) setMovements(mRes.data.movements);
                          }}
                        >
                          +10
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 overflow-x-auto">
              <h3 className="font-semibold text-sm mb-3">
                {lang === 'ne' ? 'स्टक आवागमन इतिहास' : 'Inventory Movement Ledger'}
              </h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E5E2DC] text-left text-[#78716C]">
                    <th className="py-2">SKU</th>
                    <th className="py-2">{lang === 'ne' ? 'प्रकार' : 'Type'}</th>
                    <th className="py-2 text-right">{lang === 'ne' ? 'परिवर्तन' : 'Delta'}</th>
                    <th className="py-2 text-right">{lang === 'ne' ? 'नयाँ स्टक' : 'New Qty'}</th>
                    <th className="py-2">{lang === 'ne' ? 'टिप्पणी' : 'Note'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F1EC]">
                  {movements.map((m) => (
                    <tr key={String(m.id)}>
                      <td className="py-2 font-mono">{String(m.sku)}</td>
                      <td className="py-2">{String(m.movement_type)}</td>
                      <td className="py-2 text-right tabular-nums">{String(m.quantity_delta)}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{String(m.new_quantity)}</td>
                      <td className="py-2 text-[#57534E]">{String(m.note || '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: ORDERS */}
        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold text-sm text-[#0F172A]">
                {lang === 'ne' ? 'अर्डर व्यवस्थापन' : 'Order Fulfillment'} ({orders.length})
              </h2>
              <Select
                value={orderStatusFilter}
                onChange={(e) => {
                  const st = e.target.value;
                  setOrderStatusFilter(st);
                  loadOrders(st);
                }}
                className="w-48 h-9 text-xs"
              >
                <option value="">{lang === 'ne' ? 'सबै स्थिति' : 'All Order Statuses'}</option>
                {['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'delivered', 'cancelled', 'returned'].map(
                  (st) => (
                    <option key={st} value={st}>
                      {labelFor(STATUS_LABELS, st, lang)}
                    </option>
                  )
                )}
              </Select>
            </div>

            {orders.length === 0 ? (
              <div className="p-12 text-center bg-white border border-[#E5E2DC] rounded-xl text-sm text-[#57534E]">
                {lang === 'ne' ? 'कुनै अर्डर फेला परेन।' : 'No matching orders found.'}
              </div>
            ) : (
              orders.map((o) => {
                const orderItems = (o.items as Array<Record<string, unknown>>) || [];
                const paymentObj = o.payment as Record<string, unknown> | null;
                const applyOrderStatusChange = async (newStatus: string) => {
                  setBusyOrderId(String(o.id));
                  const r = await apiFetch(`/api/coop-dashboard/orders/${o.id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: newStatus }),
                  });
                  setBusyOrderId(null);
                  if (!r.ok) {
                    toast.error(r.error || 'स्थिति अद्यावधिक असफल');
                    return;
                  }
                  toast.success(lang === 'ne' ? 'अर्डर स्थिति अद्यावधिक भयो' : 'Order updated');
                  loadOrders(orderStatusFilter);
                };

                return (
                  <div key={String(o.id)} className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-[#78716C]">
                          {String(o.order_number)} · {String(o.invoice_number)}
                        </p>
                        <p className="font-semibold text-sm text-[#0F172A]">
                          {String(o.customer_name)} ({String(o.customer_phone)})
                        </p>
                        <p className="text-xs text-[#57534E]">
                          {String(o.delivery_address || 'Store Pickup')} · {formatDateBS(String(o.created_at), lang)}
                        </p>
                        {Boolean(o.delivery_note) && (
                          <p className="text-xs text-[#78716C] mt-1">
                            {lang === 'ne' ? 'नोट:' : 'Note:'} {String(o.delivery_note)}
                          </p>
                        )}
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-bold text-base text-[#0F172A]">{formatNPR(Number(o.total_npr), lang)}</p>
                        <p className="text-xs text-[#57534E]">
                          {String(o.payment_method)} · {labelFor(STATUS_LABELS, String(o.payment_status), lang)}
                        </p>
                        {Boolean(paymentObj?.reference_number) && (
                          <p className="text-[11px] font-mono text-[#78716C]">
                            Ref: {String(paymentObj?.reference_number)}
                          </p>
                        )}
                      </div>
                    </div>

                    {orderItems.length > 0 && (
                      <div className="bg-[#FAF9F6] rounded-lg px-3 py-2 text-xs text-[#57534E] space-y-1">
                        {orderItems.map((it) => (
                          <div key={String(it.id)} className="flex justify-between gap-2">
                            <span>
                              {lang === 'ne' ? String(it.product_name_ne) : String(it.product_name_en)} ×{' '}
                              {lang === 'ne' ? toNepaliDigits(Number(it.quantity)) : String(it.quantity)}
                            </span>
                            <span className="tabular-nums font-medium">{formatNPR(Number(it.line_total_npr || 0), lang)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F3F1EC]">
                      <Select
                        disabled={busyOrderId === String(o.id)}
                        value={String(o.status)}
                        onChange={(e) => {
                          const targetStatus = e.target.value;
                          if (['cancelled', 'returned', 'refunded'].includes(targetStatus)) {
                            setPendingOrderCancel({ orderId: String(o.id), status: targetStatus });
                            return;
                          }
                          applyOrderStatusChange(targetStatus);
                        }}
                        className="max-w-[200px] h-9 text-xs"
                      >
                        {['pending', 'confirmed', 'processing', 'ready_for_dispatch', 'shipped', 'delivered', 'cancelled', 'returned'].map(
                          (st) => (
                            <option key={st} value={st}>
                              {labelFor(STATUS_LABELS, st, lang)}
                            </option>
                          )
                        )}
                      </Select>

                      {o.payment_status !== 'verified' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyOrderId === String(o.id)}
                          onClick={async () => {
                            setBusyOrderId(String(o.id));
                            const r = await apiFetch(`/api/coop-dashboard/orders/${o.id}/status`, {
                              method: 'PATCH',
                              body: JSON.stringify({ paymentStatus: 'verified' }),
                            });
                            setBusyOrderId(null);
                            if (!r.ok) {
                              toast.error(r.error || 'भुक्तानी प्रमाणित गर्न सकिएन');
                              return;
                            }
                            toast.success(lang === 'ne' ? 'भुक्तानी प्रमाणित भयो' : 'Payment verified');
                            loadOrders(orderStatusFilter);
                          }}
                        >
                          {lang === 'ne' ? 'भुक्तानी प्रमाणित गर्नुहोस्' : 'Verify Payment'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB: CUSTOMERS */}
        {tab === 'customers' && (
          <div className="bg-white border border-[#E5E2DC] rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E2DC] text-left text-xs text-[#78716C]">
                  <th className="p-3">{lang === 'ne' ? 'ग्राहक नाम' : 'Customer'}</th>
                  <th className="p-3">{lang === 'ne' ? 'फोन' : 'Phone'}</th>
                  <th className="p-3">{lang === 'ne' ? 'जिल्ला' : 'District'}</th>
                  <th className="p-3 text-right">{lang === 'ne' ? 'अर्डर संख्या' : 'Orders'}</th>
                  <th className="p-3 text-right">{lang === 'ne' ? 'कुल खर्च' : 'Total Spent'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F1EC]">
                {customers.map((c, idx) => (
                  <tr key={idx}>
                    <td className="p-3 font-medium">{String(c.customer_name)}</td>
                    <td className="p-3 font-mono text-xs">{String(c.customer_phone)}</td>
                    <td className="p-3 text-xs">{String(c.delivery_district || '-')}</td>
                    <td className="p-3 text-right tabular-nums">{String(c.order_count)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">
                      {formatNPR(Number(c.total_spent), lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB: REPORTS */}
        {tab === 'reports' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-white border border-[#E5E2DC] rounded-xl p-5">
              <div>
                <h2 className="font-semibold text-base">{lang === 'ne' ? 'बिक्री तथा अर्डर प्रतिवेदन' : 'Sales Reports'}</h2>
                <p className="text-xs text-[#57534E]">
                  {lang === 'ne' ? 'मासिक र उत्पादन-अनुसारको वास्तविक डाटाबेस रिपोर्ट।' : 'Real-time database revenue and product breakdown.'}
                </p>
              </div>
              <a
                href="/api/coop-dashboard/reports/export.csv"
                className="h-9 px-4 rounded-lg bg-[#0F172A] text-white text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'CSV डाउनलोड' : 'Export CSV'}
              </a>
            </div>

            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-3">{lang === 'ne' ? 'उत्पादन अनुसार बिक्री' : 'Product-wise Sales'}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E2DC] text-left text-xs text-[#78716C]">
                    <th className="py-2">SKU</th>
                    <th className="py-2">{lang === 'ne' ? 'उत्पादन' : 'Product'}</th>
                    <th className="py-2 text-right">{lang === 'ne' ? 'बिक्री संख्या' : 'Units'}</th>
                    <th className="py-2 text-right">{lang === 'ne' ? 'कुल आम्दानी' : 'Revenue'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F1EC]">
                  {reports.productWise.map((pw) => (
                    <tr key={pw.sku}>
                      <td className="py-2 font-mono text-xs">{pw.sku}</td>
                      <td className="py-2">{lang === 'ne' ? pw.product_name_ne : pw.product_name_en}</td>
                      <td className="py-2 text-right tabular-nums">{pw.units_sold}</td>
                      <td className="py-2 text-right tabular-nums font-semibold">{formatNPR(pw.gross_revenue, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PROMOTIONS */}
        {tab === 'promotions' && (
          <div className="space-y-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await apiFetch('/api/coop-dashboard/promotions', {
                  method: 'POST',
                  body: JSON.stringify(newPromo),
                });
                if (!res.ok) return toast.error(res.error || 'त्रुटि');
                toast.success(lang === 'ne' ? 'कूपन सिर्जना भयो' : 'Coupon created');
                setNewPromo({ code: '', titleNe: '', discountType: 'percentage', discountValue: '10', minOrderNpr: '500' });
                const r = await apiFetch<{ promotions: Array<Record<string, unknown>> }>('/api/coop-dashboard/promotions');
                if (r.ok) setPromotions(r.data.promotions);
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3"
            >
              <Input
                required
                placeholder="CODE (e.g. DASHAIN10)"
                value={newPromo.code}
                onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value })}
              />
              <Input
                required
                placeholder={lang === 'ne' ? 'शीर्षक' : 'Title'}
                value={newPromo.titleNe}
                onChange={(e) => setNewPromo({ ...newPromo, titleNe: e.target.value })}
              />
              <Select
                value={newPromo.discountType}
                onChange={(e) => setNewPromo({ ...newPromo, discountType: e.target.value })}
              >
                <option value="percentage">%</option>
                <option value="flat">NPR Flat</option>
              </Select>
              <Input
                required
                type="number"
                placeholder="Value"
                value={newPromo.discountValue}
                onChange={(e) => setNewPromo({ ...newPromo, discountValue: e.target.value })}
              />
              <Button type="submit">{lang === 'ne' ? 'कूपन थप्नुहोस्' : 'Add Coupon'}</Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F3F1EC]">
              {promotions.map((p) => (
                <div key={String(p.id)} className="p-4 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-mono font-bold text-[#B91C1C]">{String(p.code)}</p>
                    <p className="text-xs text-[#57534E]">
                      {String(p.title_ne)} · {String(p.discount_value)}{p.discount_type === 'percentage' ? '%' : ' NPR'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletePromoTarget({ id: String(p.id), code: String(p.code) })}
                  >
                    {lang === 'ne' ? 'हटाउनुहोस्' : 'Delete'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: DELIVERY */}
        {tab === 'delivery' && deliveryConfig && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await apiFetch('/api/coop-dashboard/delivery', {
                method: 'PUT',
                body: JSON.stringify(deliveryConfig),
              });
              if (!res.ok) {
                toast.error(res.error || 'डेलिभरी सेटिङ सुरक्षित गर्न सकिएन।');
                return;
              }
              toast.success(lang === 'ne' ? 'डेलिभरी सेटिङ सुरक्षित भयो।' : 'Delivery settings saved.');
            }}
            className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4"
          >
            <h2 className="font-semibold text-base">{lang === 'ne' ? 'डेलिभरी तथा भुक्तानी निर्देशन' : 'Delivery & Bank Instructions'}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'सामान्य शुल्क (रु.)' : 'Default Fee'}</label>
                <Input
                  type="number"
                  value={Number(deliveryConfig.default_fee_npr || 0)}
                  onChange={(e) => setDeliveryConfig({ ...deliveryConfig, default_fee_npr: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? 'निःशुल्क डेलिभरी सीमा' : 'Free Delivery Over'}
                </label>
                <Input
                  type="number"
                  value={Number(deliveryConfig.free_delivery_threshold_npr || 0)}
                  onChange={(e) =>
                    setDeliveryConfig({ ...deliveryConfig, free_delivery_threshold_npr: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'न्यूनतम अर्डर' : 'Min Order'}</label>
                <Input
                  type="number"
                  value={Number(deliveryConfig.minimum_order_npr || 0)}
                  onChange={(e) => setDeliveryConfig({ ...deliveryConfig, minimum_order_npr: Number(e.target.value) })}
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(deliveryConfig.pickup_enabled)}
                onChange={(e) => setDeliveryConfig({ ...deliveryConfig, pickup_enabled: e.target.checked })}
              />
              <span>{lang === 'ne' ? 'सहकारी पसलबाट प्रत्यक्ष पिकअप (Store Pickup) सक्षम गर्नुहोस्' : 'Enable In-Store Cooperative Pickup'}</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पिकअप ठेगाना (नेपाली)' : 'Pickup Address (Nepali)'}</label>
                <Input
                  value={String(deliveryConfig.pickup_address_ne || '')}
                  onChange={(e) => setDeliveryConfig({ ...deliveryConfig, pickup_address_ne: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पिकअप ठेगाना (English)' : 'Pickup Address (English)'}</label>
                <Input
                  value={String(deliveryConfig.pickup_address_en || '')}
                  onChange={(e) => setDeliveryConfig({ ...deliveryConfig, pickup_address_en: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'सेवा क्षेत्रहरू (अल्पविराम "," ले छुट्टाउनुहोस्)' : 'Delivery Areas (comma-separated)'}
              </label>
              <Input
                value={
                  Array.isArray(deliveryConfig.delivery_areas)
                    ? (deliveryConfig.delivery_areas as string[]).join(', ')
                    : String(deliveryConfig.delivery_areas || '')
                }
                onChange={(e) =>
                  setDeliveryConfig({
                    ...deliveryConfig,
                    delivery_areas: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="काठमाडौँ, ललितपुर, भक्तपुर"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'डेलिभरी निर्देशन' : 'Delivery Instructions'}
              </label>
              <Textarea
                value={String(deliveryConfig.delivery_instructions_ne || '')}
                onChange={(e) => setDeliveryConfig({ ...deliveryConfig, delivery_instructions_ne: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'बैंक / QR भुक्तानी निर्देशन' : 'Manual Bank / QR Payment Instructions'}
              </label>
              <Textarea
                value={String(deliveryConfig.bank_payment_instructions_ne || '')}
                onChange={(e) => setDeliveryConfig({ ...deliveryConfig, bank_payment_instructions_ne: e.target.value })}
              />
            </div>
            <Button type="submit">{lang === 'ne' ? 'सेटिङ सुरक्षित गर्नुहोस्' : 'Save Settings'}</Button>
          </form>
        )}

        {/* TAB: STAFF */}
        {tab === 'staff' && (
          <div className="space-y-5">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await apiFetch('/api/coop-dashboard/staff', {
                  method: 'POST',
                  body: JSON.stringify({
                    fullName: newStaff.fullName,
                    email: newStaff.email,
                    phone: newStaff.phone,
                    password: newStaff.password,
                    staffRole: newStaff.staffRole,
                    permissions: {
                      manage_products: newStaff.manage_products,
                      manage_orders: newStaff.manage_orders,
                      manage_inventory: newStaff.manage_inventory,
                      manage_store: newStaff.manage_store,
                      view_reports: newStaff.view_reports,
                    },
                  }),
                });
                if (!res.ok) return toast.error(res.error || 'कर्मचारी थप्न सकिएन');
                toast.success(lang === 'ne' ? 'कर्मचारी खाता सिर्जना भयो' : 'Staff account created');
                const r = await apiFetch<{ staff: Array<Record<string, unknown>> }>('/api/coop-dashboard/staff');
                if (r.ok) setStaffList(r.data.staff);
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h2 className="font-semibold text-base">{lang === 'ne' ? 'नयाँ कर्मचारी थप्नुहोस्' : 'Add Cooperative Staff'}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input
                  required
                  placeholder={lang === 'ne' ? 'पूरा नाम' : 'Full Name'}
                  value={newStaff.fullName}
                  onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                />
                <Input
                  placeholder="98XXXXXXXX"
                  value={newStaff.phone}
                  onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                />
                <Input
                  required
                  type="password"
                  placeholder={lang === 'ne' ? 'पासवर्ड' : 'Password'}
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs">
                {[
                  ['manage_products', 'Products'],
                  ['manage_orders', 'Orders'],
                  ['manage_inventory', 'Inventory'],
                  ['manage_store', 'Store Builder'],
                  ['view_reports', 'Reports'],
                ].map(([k, lbl]) => (
                  <label key={k} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={Boolean((newStaff as Record<string, unknown>)[k])}
                      onChange={(e) => setNewStaff({ ...newStaff, [k]: e.target.checked })}
                    />
                    <span>{lbl}</span>
                  </label>
                ))}
              </div>
              <Button type="submit">{lang === 'ne' ? 'कर्मचारी थप्नुहोस्' : 'Create Staff Account'}</Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F3F1EC]">
              {staffList.map((s) => (
                <div key={String(s.id)} className="p-4 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{String(s.full_name)}</p>
                    <p className="text-xs text-[#57534E]">
                      {String(s.email || s.phone)} · {String(s.staff_role)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteStaffTarget({ id: String(s.id), name: String(s.full_name) })}
                  >
                    {lang === 'ne' ? 'हटाउनुहोस्' : 'Remove'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: BILLING */}
        {tab === 'billing' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-2">
              <h2 className="font-semibold text-base">{lang === 'ne' ? 'सदस्यता योजना र नवीकरण' : 'Subscription & Billing'}</h2>
              {billing.subscription && (
                <p className="text-sm text-[#57534E]">
                  {lang === 'ne' ? 'सक्रिय योजना:' : 'Active Plan:'}{' '}
                  <strong className="text-[#0F172A]">
                    {lang === 'ne' ? String(billing.subscription.plan_name_ne) : String(billing.subscription.plan_name_en)}
                  </strong>{' '}
                  · {formatDateBS(String(billing.subscription.ends_at), lang)}
                </p>
              )}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await apiFetch('/api/coop-dashboard/billing/submit-payment', {
                  method: 'POST',
                  body: JSON.stringify(billingPay),
                });
                if (!res.ok) return toast.error(res.error || 'पेश गर्न सकिएन');
                toast.success(lang === 'ne' ? 'भुक्तानी प्रमाण पेश गरियो। सुपर एडमिन स्वीकृतिपछि सक्रिय हुनेछ।' : 'Payment submitted!');
                const r = await apiFetch<typeof billing>('/api/coop-dashboard/billing');
                if (r.ok) setBilling(r.data);
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3"
            >
              <Select
                required
                value={billingPay.planId}
                onChange={(e) => setBillingPay({ ...billingPay, planId: e.target.value })}
              >
                <option value="">{lang === 'ne' ? 'योजना छान्नुहोस्' : 'Select Plan'}</option>
                {billing.plans.map((pl) => (
                  <option key={String(pl.id)} value={String(pl.id)}>
                    {lang === 'ne' ? String(pl.name_ne) : String(pl.name_en)} ({formatNPR(Number(pl.monthly_price_npr), lang)})
                  </option>
                ))}
              </Select>
              <Select
                value={billingPay.billingCycle}
                onChange={(e) => setBillingPay({ ...billingPay, billingCycle: e.target.value })}
              >
                <option value="monthly">{lang === 'ne' ? 'मासिक' : 'Monthly'}</option>
                <option value="annual">{lang === 'ne' ? 'वार्षिक' : 'Annual'}</option>
              </Select>
              <Input
                required
                placeholder={lang === 'ne' ? 'भौचर / ट्रान्जेक्सन नं.' : 'Bank Ref Number'}
                value={billingPay.referenceNumber}
                onChange={(e) => setBillingPay({ ...billingPay, referenceNumber: e.target.value })}
              />
              <Button type="submit">{lang === 'ne' ? 'भुक्तानी पेश गर्नुहोस्' : 'Submit Payment'}</Button>
            </form>

            <div className="bg-white border border-[#E5E2DC] rounded-xl divide-y divide-[#F3F1EC]">
              {billing.payments.map((pay) => (
                <div key={String(pay.id)} className="p-4 flex justify-between text-xs">
                  <span>
                    {lang === 'ne' ? String(pay.plan_name_ne) : String(pay.plan_name_en)} ({String(pay.billing_cycle)}) · Ref:{' '}
                    {String(pay.reference_number || '-')}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatNPR(Number(pay.amount_npr), lang)} · {labelFor(STATUS_LABELS, String(pay.status), lang)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: SUPPORT & NOTIFICATIONS */}
        {tab === 'support' && (
          <div className="space-y-6">
            <div className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Bell className="w-4 h-4" /> {lang === 'ne' ? 'सूचनाहरू' : 'Notifications'}
                </h2>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await apiFetch('/api/coop-dashboard/notifications/read-all', { method: 'POST' });
                    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
                  }}
                >
                  {lang === 'ne' ? 'सबै पढिएको चिन्ह' : 'Mark All Read'}
                </Button>
              </div>
              <div className="divide-y divide-[#F3F1EC] text-xs">
                {notifications.map((n) => (
                  <div key={String(n.id)} className="py-2.5 flex justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? String(n.title_ne) : String(n.title_en)}</p>
                      <p className="text-[#57534E]">{lang === 'ne' ? String(n.body_ne) : String(n.body_en)}</p>
                    </div>
                    <span className="text-[#78716C] shrink-0">{formatDateBS(String(n.created_at), lang)}</span>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await apiFetch('/api/coop-dashboard/support', { method: 'POST', body: JSON.stringify(newTicket) });
                if (!res.ok) {
                  toast.error(res.error || 'सहायता टिकट पठाउन सकिएन।');
                  return;
                }
                toast.success(lang === 'ne' ? 'सहायता टिकट पठाइयो' : 'Support ticket submitted');
                setNewTicket({ subject: '', message: '' });
                const r = await apiFetch<{ tickets: Array<Record<string, unknown>> }>('/api/coop-dashboard/support');
                if (r.ok) setTickets(r.data.tickets);
              }}
              className="bg-white border border-[#E5E2DC] rounded-xl p-5 space-y-3"
            >
              <h3 className="font-semibold text-sm">{lang === 'ne' ? 'प्लेटफर्म सहायता टिकट' : 'Platform Support Ticket'}</h3>
              <Input
                required
                placeholder={lang === 'ne' ? 'विषय' : 'Subject'}
                value={newTicket.subject}
                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
              />
              <Textarea
                required
                placeholder={lang === 'ne' ? 'समस्याको विवरण' : 'Message'}
                value={newTicket.message}
                onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
              />
              <Button type="submit">{lang === 'ne' ? 'टिकट पठाउनुहोस्' : 'Submit Ticket'}</Button>
            </form>

            {tickets.map((tk) => {
              const tkId = String(tk.id);
              return (
                <div key={tkId} className="bg-white border border-[#E5E2DC] rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{String(tk.subject)}</span>
                    <span className="text-[#15803D]">{String(tk.status)}</span>
                  </div>
                  {((tk.messages as Array<Record<string, unknown>>) || []).map((m) => (
                    <p key={String(m.id)} className="text-[#57534E]">
                      <strong>{String(m.sender_role)}:</strong> {String(m.message)}
                    </p>
                  ))}
                  <div className="flex gap-2 pt-2 border-t border-[#F3F1EC]">
                    <Input
                      value={ticketReplies[tkId] || ''}
                      onChange={(e) => setTicketReplies({ ...ticketReplies, [tkId]: e.target.value })}
                      placeholder={lang === 'ne' ? 'जवाफ थप्नुहोस्...' : 'Add reply...'}
                      className="h-8 text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const msg = (ticketReplies[tkId] || '').trim();
                        if (!msg) return;
                        const r = await apiFetch(`/api/coop-dashboard/support/${tkId}/reply`, {
                          method: 'POST',
                          body: JSON.stringify({ message: msg }),
                        });
                        if (!r.ok) {
                          toast.error(r.error || 'जवाफ पठाउन सकिएन।');
                          return;
                        }
                        setTicketReplies({ ...ticketReplies, [tkId]: '' });
                        toast.success(lang === 'ne' ? 'जवाफ पठाइयो।' : 'Reply sent.');
                        const ref = await apiFetch<{ tickets: Array<Record<string, unknown>> }>('/api/coop-dashboard/support');
                        if (ref.ok) setTickets(ref.data.tickets);
                      }}
                    >
                      {lang === 'ne' ? 'पठाउनुहोस्' : 'Reply'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={confirmPublishStore}
        title={lang === 'ne' ? 'पसल प्रकाशित गर्ने हो?' : 'Publish Storefront Live?'}
        description={
          lang === 'ne'
            ? 'प्रकाशित गरेपछि तपाईंको पसल र रङ/खण्ड संरचना सबै ग्राहकहरूको लागि देखिनेछ।'
            : 'Publishing makes your updated storefront live to marketplace visitors.'
        }
        confirmLabel={lang === 'ne' ? 'प्रकाशित गर्नुहोस्' : 'Publish'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={savingStore}
        onConfirm={() => handleSaveStore(true)}
        onCancel={() => setConfirmPublishStore(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteProdTarget)}
        variant="destructive"
        title={lang === 'ne' ? 'उत्पादन हटाउनुहोस् / आर्काइभ गर्नुहोस्?' : 'Delete or Archive Product?'}
        description={
          lang === 'ne'
            ? `"${deleteProdTarget?.name || ''}" हटाउने निश्चित हुनुहुन्छ? यदि पहिले नै अर्डर छ भने उत्पादन आर्काइभ हुनेछ।`
            : `Are you sure you want to remove "${deleteProdTarget?.name || ''}"? Products with existing orders will be safely archived.`
        }
        confirmLabel={lang === 'ne' ? 'पुष्टि गर्नुहोस्' : 'Confirm'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={confirmBusy}
        onConfirm={async () => {
          if (!deleteProdTarget) return;
          setConfirmBusy(true);
          const r = await apiFetch<{ message?: string }>(`/api/coop-dashboard/products/${deleteProdTarget.id}`, {
            method: 'DELETE',
          });
          setConfirmBusy(false);
          if (!r.ok) {
            toast.error(r.error || 'उत्पादन हटाउन सकिएन।');
            return;
          }
          toast.success(r.data?.message || (lang === 'ne' ? 'उत्पादन हटाइयो।' : 'Product removed.'));
          setDeleteProdTarget(null);
          const ref = await apiFetch<{ products: Array<Record<string, unknown>> }>('/api/coop-dashboard/products');
          if (ref.ok) setProducts(ref.data.products);
        }}
        onCancel={() => setDeleteProdTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteCatTarget)}
        variant="destructive"
        title={lang === 'ne' ? 'पसल वर्ग हटाउनुहोस्?' : 'Delete Store Category?'}
        description={
          lang === 'ne'
            ? `"${deleteCatTarget?.name || ''}" वर्ग हटाउने हो?`
            : `Remove "${deleteCatTarget?.name || ''}" category?`
        }
        confirmLabel={lang === 'ne' ? 'हटाउनुहोस्' : 'Delete'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={confirmBusy}
        onConfirm={async () => {
          if (!deleteCatTarget) return;
          setConfirmBusy(true);
          const r = await apiFetch(`/api/coop-dashboard/categories/${deleteCatTarget.id}`, { method: 'DELETE' });
          setConfirmBusy(false);
          if (!r.ok) {
            toast.error(r.error || 'वर्ग हटाउन सकिएन।');
            return;
          }
          setCoopCats((prev) => prev.filter((x) => x.id !== deleteCatTarget.id));
          setDeleteCatTarget(null);
          toast.success(lang === 'ne' ? 'वर्ग हटाइयो।' : 'Category deleted.');
        }}
        onCancel={() => setDeleteCatTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deletePromoTarget)}
        variant="destructive"
        title={lang === 'ne' ? 'कूपन हटाउनुहोस्?' : 'Delete Coupon?'}
        description={
          lang === 'ne'
            ? `कूपन "${deletePromoTarget?.code || ''}" हटाउने निश्चित हुनुहुन्छ?`
            : `Delete coupon "${deletePromoTarget?.code || ''}"?`
        }
        confirmLabel={lang === 'ne' ? 'हटाउनुहोस्' : 'Delete'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={confirmBusy}
        onConfirm={async () => {
          if (!deletePromoTarget) return;
          setConfirmBusy(true);
          const r = await apiFetch(`/api/coop-dashboard/promotions/${deletePromoTarget.id}`, { method: 'DELETE' });
          setConfirmBusy(false);
          if (!r.ok) {
            toast.error(r.error || 'कूपन हटाउन सकिएन।');
            return;
          }
          setPromotions((prev) => prev.filter((x) => x.id !== deletePromoTarget.id));
          setDeletePromoTarget(null);
          toast.success(lang === 'ne' ? 'कूपन हटाइयो।' : 'Coupon deleted.');
        }}
        onCancel={() => setDeletePromoTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteStaffTarget)}
        variant="destructive"
        title={lang === 'ne' ? 'कर्मचारी हटाउनुहोस्?' : 'Remove Cooperative Staff?'}
        description={
          lang === 'ne'
            ? `"${deleteStaffTarget?.name || ''}" को पहुँच हटाउने निश्चित हुनुहुन्छ?`
            : `Remove access for "${deleteStaffTarget?.name || ''}"?`
        }
        confirmLabel={lang === 'ne' ? 'हटाउनुहोस्' : 'Remove'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={confirmBusy}
        onConfirm={async () => {
          if (!deleteStaffTarget) return;
          setConfirmBusy(true);
          const r = await apiFetch(`/api/coop-dashboard/staff/${deleteStaffTarget.id}`, { method: 'DELETE' });
          setConfirmBusy(false);
          if (!r.ok) {
            toast.error(r.error || 'कर्मचारी हटाउन सकिएन।');
            return;
          }
          setStaffList((prev) => prev.filter((x) => x.id !== deleteStaffTarget.id));
          setDeleteStaffTarget(null);
          toast.success(lang === 'ne' ? 'कर्मचारी हटाइयो।' : 'Staff removed.');
        }}
        onCancel={() => setDeleteStaffTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingOrderCancel)}
        variant="destructive"
        title={lang === 'ne' ? 'अर्डर रद्द / फिर्ता पुष्टि गर्नुहोस्' : 'Confirm Order Cancellation / Return'}
        description={
          lang === 'ne'
            ? `के तपाईं अर्डर स्थिति "${pendingOrderCancel?.status || ''}" मा परिवर्तन गर्न निश्चित हुनुहुन्छ?`
            : `Are you sure you want to change order status to "${pendingOrderCancel?.status || ''}"?`
        }
        confirmLabel={lang === 'ne' ? 'पुष्टि गर्नुहोस्' : 'Confirm Status'}
        cancelLabel={lang === 'ne' ? 'रद्द' : 'Cancel'}
        loading={confirmBusy}
        onConfirm={async () => {
          if (!pendingOrderCancel) return;
          setConfirmBusy(true);
          const r = await apiFetch(`/api/coop-dashboard/orders/${pendingOrderCancel.orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: pendingOrderCancel.status }),
          });
          setConfirmBusy(false);
          if (!r.ok) {
            toast.error(r.error || 'स्थिति परिवर्तन असफल');
            return;
          }
          setPendingOrderCancel(null);
          toast.success(lang === 'ne' ? 'अर्डर स्थिति अद्यावधिक भयो' : 'Order updated');
          loadOrders(orderStatusFilter);
        }}
        onCancel={() => setPendingOrderCancel(null)}
      />
    </div>
  );
}
