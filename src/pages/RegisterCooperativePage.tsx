import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Globe, Info, LogIn, ShieldCheck, Sparkles, Store, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { adStringToBsString, bsStringToAdString, formatDateBS, NEPAL_PROVINCES, parseBsDateInput } from '../lib/bs-date';
import { COOP_TYPES } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { NepaliInput } from '../components/ui/nepali-input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export function RegisterCooperativePage() {
  const { lang, user, logout, navigate, refreshSession } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpNotice, setOtpNotice] = useState('');
  const [duplicateUpgradePrompt, setDuplicateUpgradePrompt] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState('');
  const [aiPrefilling, setAiPrefilling] = useState(false);
  const [aiResearchInfo, setAiResearchInfo] = useState<{
    summary: string;
    sources: Array<{ title: string; url: string }>;
  } | null>(null);

  const isBuyerUpgrade = user?.role === 'buyer';
  const isExistingCoopOrAdmin = Boolean(user && user.role !== 'buyer');

  const [form, setForm] = useState({
    nameNe: '',
    nameEn: '',
    registrationNumber: '',
    registrationAuthority: '',
    registrationDateAd: '2022-05-15',
    registrationDateBs: '२०७९-०२-०१',
    cooperativeType: 'agriculture',
    panVatNumber: '',
    province: 'बागमती प्रदेश',
    district: 'काठमाडौँ',
    municipality: '',
    wardNumber: '',
    toleAddress: '',
    contactEmail: '',
    contactPhone: '',
    authorizedRepName: '',
    authorizedRepDesignation: '',
    requestedStoreName: '',
    requestedSlug: '',
    password: '',
    logoBase64: '',
    documentBase64: '',
    documentFileName: '',
    otpCode: '',
  });

  useEffect(() => {
    if (user?.role === 'buyer') {
      setDuplicateUpgradePrompt(null);
      setForm((prev) => ({
        ...prev,
        contactEmail: prev.contactEmail || user.email || '',
        contactPhone: prev.contactPhone || user.phone || '',
        authorizedRepName: prev.authorizedRepName || user.full_name || '',
      }));
    }
  }, [user]);

  const districts = NEPAL_PROVINCES[form.province]?.districts || [];

  const handleFileChange = (field: 'logoBase64' | 'documentBase64', file?: File) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error(lang === 'ne' ? 'फाइल ४ MB भन्दा सानो हुनुपर्छ।' : 'File must be under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        [field]: String(reader.result || ''),
        ...(field === 'documentBase64' ? { documentFileName: file.name } : {}),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSendOtp = async () => {
    setOtpSending(true);
    setOtpNotice('');
    const res = await apiFetch<{
      ok: boolean;
      smsConfigured: boolean;
      smsSent: boolean;
      localOtpNotice?: string;
    }>('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: form.contactPhone, purpose: 'coop_registration' }),
    });
    setOtpSending(false);
    if (!res.ok) {
      toast.error(res.error || 'OTP पठाउन सकिएन।');
      return;
    }
    if (res.data.localOtpNotice) {
      setOtpNotice(res.data.localOtpNotice);
    } else {
      toast.success(lang === 'ne' ? 'Akash SMS मार्फत OTP पठाइयो।' : 'OTP sent via Akash SMS.');
    }
  };

  const handleAiPrefillCoop = async () => {
    const cleanHint = aiHint.trim() || form.nameNe.trim() || form.nameEn.trim();
    if (cleanHint.length < 3) {
      toast.error(
        lang === 'ne'
          ? 'कृपया कम्तीमा सहकारीको नाम र जिल्ला लेख्नुहोस् (जस्तै: सुनौलो महिला बहुउद्देश्यीय सहकारी, बर्दिया)।'
          : 'Enter your cooperative name and district (e.g. Sunaulo Mahila Bahudeshya Sahakari Sanstha Bardiya).'
      );
      return;
    }
    setAiPrefilling(true);
    setAiResearchInfo(null);
    const res = await apiFetch<{
      prefill: {
        name_ne: string;
        name_en: string;
        registration_number: string;
        registration_authority: string;
        registration_date_ad: string;
        registration_date_bs: string;
        cooperative_type: string;
        pan_vat_number: string;
        province: string;
        district: string;
        municipality: string;
        ward_number: string;
        tole_address: string;
        contact_email: string;
        contact_phone: string;
        authorized_rep_name: string;
        authorized_rep_designation: string;
        requested_store_name: string;
        requested_slug: string;
        research_summary: string;
        sources: Array<{ title: string; url: string }>;
      };
    }>('/api/cooperatives/ai-prefill', {
      method: 'POST',
      body: JSON.stringify({ hint: cleanHint, language: lang }),
    });
    setAiPrefilling(false);
    if (!res.ok) {
      toast.error(res.error || 'AI प्रिफिल असफल भयो।');
      return;
    }
    const p = res.data.prefill;

    let syncedAd = '';
    let syncedBs = '';
    if (p.registration_date_ad) {
      syncedAd = p.registration_date_ad;
      syncedBs = p.registration_date_bs
        ? adStringToBsString(p.registration_date_ad, true) || p.registration_date_bs
        : adStringToBsString(p.registration_date_ad, true) || '';
    } else if (p.registration_date_bs) {
      const convertedAd = bsStringToAdString(p.registration_date_bs);
      if (convertedAd) {
        syncedAd = convertedAd;
        syncedBs = adStringToBsString(convertedAd, true) || p.registration_date_bs;
      } else {
        syncedBs = p.registration_date_bs;
      }
    }

    setForm((prev) => {
      const nextProvince = p.province || prev.province;
      const nextDistrict =
        p.district ||
        (p.province && p.province !== prev.province
          ? NEPAL_PROVINCES[p.province]?.districts[0] || ''
          : prev.district);

      return {
        ...prev,
        nameNe: p.name_ne || prev.nameNe,
        nameEn: p.name_en || prev.nameEn,
        registrationNumber: p.registration_number || prev.registrationNumber,
        registrationAuthority: p.registration_authority || prev.registrationAuthority,
        ...(syncedAd ? { registrationDateAd: syncedAd } : {}),
        ...(syncedBs ? { registrationDateBs: syncedBs } : {}),
        cooperativeType: p.cooperative_type || prev.cooperativeType,
        panVatNumber: p.pan_vat_number || prev.panVatNumber,
        province: nextProvince,
        district: nextDistrict,
        municipality: p.municipality || prev.municipality,
        wardNumber: p.ward_number || prev.wardNumber,
        toleAddress: p.tole_address || prev.toleAddress,
        contactEmail: isBuyerUpgrade ? prev.contactEmail || p.contact_email : p.contact_email || prev.contactEmail,
        contactPhone: isBuyerUpgrade ? prev.contactPhone || p.contact_phone : p.contact_phone || prev.contactPhone,
        authorizedRepName: p.authorized_rep_name || prev.authorizedRepName,
        authorizedRepDesignation: p.authorized_rep_designation || prev.authorizedRepDesignation,
        requestedStoreName: p.requested_store_name || prev.requestedStoreName,
        requestedSlug: p.requested_slug || prev.requestedSlug,
      };
    });

    if (p.research_summary || (Array.isArray(p.sources) && p.sources.length > 0)) {
      setAiResearchInfo({
        summary: p.research_summary || '',
        sources: Array.isArray(p.sources) ? p.sources : [],
      });
    }

    toast.success(
      lang === 'ne'
        ? 'AI ले इन्टरनेटमा खोजेर भेटिएका विवरणहरू फारममा स्वतः भरेको छ! कृपया एकपटक जाँच गर्नुहोस्।'
        : 'AI researched your cooperative online and auto-filled discovered details! Please verify.'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDuplicateUpgradePrompt(null);
    setSubmitting(true);
    const res = await apiFetch<{
      cooperative?: { id: string; status: string };
      upgradedFromBuyer?: boolean;
      code?: string;
    }>('/api/cooperatives/register', {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        upgradeExistingAccount: isBuyerUpgrade,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      if (res.data?.code === 'EXISTING_ACCOUNT_LOGIN_TO_UPGRADE') {
        setDuplicateUpgradePrompt(
          res.error ||
            (lang === 'ne'
              ? 'यो मोबाइल नम्बर वा इमेल पहिले नै खातामा दर्ता भइसकेको छ।'
              : 'This email or phone number is already registered.')
        );
      }
      toast.error(res.error || 'दर्ता असफल भयो।');
      return;
    }
    await refreshSession();
    toast.success(
      res.data.upgradedFromBuyer
        ? lang === 'ne'
          ? 'तपाईंको खाता सहकारीमा स्तरोन्नति भई आवेदन पेश भयो!'
          : 'Your account has been upgraded and cooperative application submitted!'
        : lang === 'ne'
        ? 'सहकारी दर्ता पेश भयो! सुपर एडमिन समीक्षाको लागि ड्यासबोर्डमा जाँदैछ।'
        : 'Cooperative application submitted!'
    );
    navigate('/cooperative');
  };

  const validateStep1 = () => {
    if (
      !form.nameNe.trim() ||
      !form.nameEn.trim() ||
      !form.registrationNumber.trim() ||
      !form.registrationAuthority.trim() ||
      !form.registrationDateAd.trim()
    ) {
      toast.error(
        lang === 'ne'
          ? 'कृपया चरण १ का सबै अनिवार्य (*) विवरणहरू भर्नुहोस्।'
          : 'Please complete all required (*) fields in Step 1.'
      );
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (
      !form.municipality.trim() ||
      !form.wardNumber.trim() ||
      !form.toleAddress.trim() ||
      !form.authorizedRepName.trim() ||
      !form.authorizedRepDesignation.trim()
    ) {
      toast.error(
        lang === 'ne'
          ? 'कृपया चरण २ का सबै अनिवार्य (*) ठेगाना र प्रतिनिधि विवरण भर्नुहोस्।'
          : 'Please complete all required (*) address and representative fields in Step 2.'
      );
      return false;
    }
    return true;
  };

  const handleStepNav = (targetStep: 1 | 2 | 3) => {
    if (targetStep === 2 && !validateStep1()) return;
    if (targetStep === 3 && (!validateStep1() || !validateStep2())) return;
    setStep(targetStep);
  };

  if (isExistingCoopOrAdmin && user) {
    const dashboardPath = user.role === 'super_admin' ? '/super-admin' : '/cooperative';
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-2.5 text-[#0F172A]">
            <Info className="w-5 h-5 text-[#B91C1C] shrink-0" />
            <h1 className="font-display text-xl sm:text-2xl font-bold">
              {lang === 'ne'
                ? 'तपाईंको सहकारी वा एडमिन खाता पहिले नै सक्रिय छ'
                : 'Your Cooperative or Admin Account Is Already Active'}
            </h1>
          </div>
          <p className="text-sm text-[#57534E] leading-relaxed">
            {lang === 'ne'
              ? `तपाईं हाल ${user.email || user.phone} बाट लगइन हुनुहुन्छ। एउटै खाताबाट अर्को छुट्टै सहकारी दर्ता गर्न मिल्दैन। तपाईं सिधै आफ्नो ड्यासबोर्डमा जान सक्नुहुन्छ, वा अर्को नयाँ सहकारी दर्ता गर्न पहिले बाहिर निस्कन सक्नुहुन्छ।`
              : `You are currently signed in as ${user.email || user.phone}. A single account cannot register a second cooperative. Open your dashboard below, or sign out first to register a separate cooperative.`}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button type="button" onClick={() => navigate(dashboardPath)}>
              {lang === 'ne' ? 'मेरो ड्यासबोर्डमा जानुहोस्' : 'Go to My Dashboard'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/marketplace')}>
              {lang === 'ne' ? 'बजार हेर्नुहोस्' : 'Browse Marketplace'}
            </Button>
            <Button type="button" variant="outline" onClick={logout}>
              {lang === 'ne' ? 'नयाँ सहकारी दर्ता गर्न बाहिर निस्कनुहोस्' : 'Sign Out to Register Another'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="space-y-2 border-b border-[#E5E2DC] pb-5">
        <p className="text-xs font-medium text-[#B91C1C]">
          {lang === 'ne' ? 'सहकारी अनबोर्डिङ तथा प्रमाणीकरण' : 'Cooperative Onboarding & Verification'}
        </p>
        <h1 className="font-display text-3xl font-bold text-[#0F172A]">
          {lang === 'ne' ? 'नयाँ सहकारी संस्था दर्ता आवेदन' : 'Cooperative Registration Application'}
        </h1>
        <p className="text-sm text-[#57534E]">
          {lang === 'ne'
            ? 'दर्ता → मोबाइल OTP → सुपर एडमिन स्वीकृति → सदस्यता सक्रियता → पसल प्रकाशन।'
            : 'Workflow: Registration → Mobile OTP → Admin Review → Subscription Activation → Store Publication.'}
        </p>
      </div>

      {isBuyerUpgrade && (
        <div className="p-4 rounded-xl border border-[#15803D]/30 bg-[#15803D]/5 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#15803D]">
            <Store className="w-4 h-4 shrink-0" />
            <span>
              {lang === 'ne'
                ? 'क्रेता (Buyer) खाताबाट सिधै सहकारी दर्ता तथा खाता स्तरोन्नति'
                : 'Upgrade Signed-In Buyer Account to Cooperative Admin'}
            </span>
          </div>
          <p className="text-xs text-[#44403C] leading-relaxed">
            {lang === 'ne'
              ? `तपाईं हाल ${user.email || user.phone} बाट लगइन हुनुहुन्छ। यही इमेल र मोबाइल नम्बर प्रयोग गरेर सहकारी दर्ता गर्दा तपाईंको खाता स्वतः सहकारी प्रशासक (Cooperative Admin) मा स्तरोन्नति हुनेछ—नयाँ फोन वा इमेल राख्नु पर्दैन। चरण ३ मा हालको खाताको पासवर्ड पुष्टि गर्नुहोस्।`
              : `You are signed in as ${user.email || user.phone}. Completing this form will upgrade your existing account to Cooperative Admin using your same email and phone number. Just confirm your current password in Step 3.`}
          </p>
        </div>
      )}

      {/* Stepper */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { num: 1, ne: '१. आधिकारिक विवरण', en: '1. Legal Details' },
          { num: 2, ne: '२. ठेगाना र कागजात', en: '2. Address & Docs' },
          { num: 3, ne: '३. पसल र OTP', en: '3. Store & OTP' },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => handleStepNav(s.num as 1 | 2 | 3)}
            className={`py-2.5 px-3 rounded-lg text-xs font-semibold border text-left cursor-pointer ${
              step === s.num
                ? 'bg-[#0F172A] text-white border-[#0F172A]'
                : 'bg-white text-[#57534E] border-[#E5E2DC]'
            }`}
          >
            {lang === 'ne' ? s.ne : s.en}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#B91C1C]/20 bg-[#FAF9F6] p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                  <Sparkles className="w-4 h-4 text-[#B91C1C]" />
                  <span>
                    {lang === 'ne'
                      ? 'छिटो दर्ता: AI बाट इन्टरनेट खोजेर फारम स्वतः भर्नुहोस्'
                      : 'Fast Track: Research Online & Auto-Fill with AI'}
                  </span>
                </div>
                <span className="text-[11px] text-[#78716C] flex items-center gap-1">
                  <Globe className="w-3 h-3 text-[#B91C1C]" />
                  {lang === 'ne'
                    ? 'वेब खोज + नेपाली / अंग्रेजी एकैसाथ भरिन्छ'
                    : 'Web Research + Bilingual Auto-Fill'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAiPrefillCoop();
                    }
                  }}
                  placeholder={
                    lang === 'ne'
                      ? 'सहकारीको नाम र जिल्ला लेख्नुहोस् (जस्तै: Sunaulo Mahila Bahudeshya Sahakari Sanstha Bardiya)'
                      : 'Enter cooperative name & district (e.g. Sunaulo Mahila Bahudeshya Sahakari Sanstha Bardiya)'
                  }
                  className="bg-white flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={aiPrefilling}
                  onClick={handleAiPrefillCoop}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {aiPrefilling
                    ? lang === 'ne'
                      ? 'खोजेर भर्दैछ...'
                      : 'Researching...'
                    : lang === 'ne'
                    ? 'AI बाट खोजेर भर्नुहोस्'
                    : 'Research & Auto-Fill'}
                </Button>
              </div>
              {aiResearchInfo && (
                <div className="rounded-lg bg-white border border-[#E5E2DC] p-2.5 space-y-1.5 text-xs">
                  {aiResearchInfo.summary && (
                    <p className="text-[#44403C] leading-relaxed">{aiResearchInfo.summary}</p>
                  )}
                  {aiResearchInfo.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[11px] font-medium text-[#78716C]">
                        {lang === 'ne' ? 'स्रोतहरू:' : 'Sources:'}
                      </span>
                      {aiResearchInfo.sources.map((src, idx) => (
                        <a
                          key={`${src.url}-${idx}`}
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#B91C1C] hover:underline bg-[#FAF9F6] border border-[#E5E2DC] rounded px-1.5 py-0.5 max-w-[220px] truncate"
                          title={src.title}
                        >
                          <span className="truncate">{src.title}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-[#FAF9F6] border border-[#E5E2DC] px-3 py-2 text-xs text-[#57534E]">
              {lang === 'ne'
                ? 'सुझाव: नेपाली लेख्ने बक्सहरूमा किबोर्ड भाषा नबदली सिधै अंग्रेजीमा लेख्नुहोस् (जस्तै: sahakari + Space) — स्वतः नेपाली बन्नेछ।'
                : 'Tip: In Nepali fields, type phonetically in English (e.g. "sahakari" + Space) — it auto-converts to Nepali without changing your OS keyboard.'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'सहकारीको आधिकारिक नाम (नेपाली) *' : 'Official Name (Nepali) *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={true}
                  value={form.nameNe}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, nameNe: val }))}
                  placeholder="जस्तै: सगरमाथा कृषि सहकारी संस्था लि."
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'सहकारीको आधिकारिक नाम (English) *' : 'Official Name (English) *'}
                </label>
                <Input
                  required
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  placeholder="e.g. Sagarmatha Agriculture Cooperative Ltd."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'सहकारी दर्ता नम्बर *' : 'Registration Number *'}
                </label>
                <Input
                  required
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                  placeholder="REG-2081-001"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'दर्ता गर्ने निकाय (Authority) *' : 'Registration Authority *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.registrationAuthority}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, registrationAuthority: val }))}
                  placeholder="डिभिजन सहकारी कार्यालय / नगरपालिका"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'दर्ता मिति (AD) *' : 'Registration Date (AD) *'}
                </label>
                <Input
                  type="date"
                  required
                  value={form.registrationDateAd}
                  onChange={(e) => {
                    const nextAd = e.target.value;
                    const nextBs = adStringToBsString(nextAd, true);
                    setForm((prev) => ({
                      ...prev,
                      registrationDateAd: nextAd,
                      ...(nextBs ? { registrationDateBs: nextBs } : {}),
                    }));
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'दर्ता मिति (बि.सं.) — स्वतः रूपान्तरण' : 'Registration Date (BS) — Auto Sync'}
                </label>
                <Input
                  value={form.registrationDateBs}
                  onChange={(e) => {
                    const nextBs = e.target.value;
                    const nextAd = bsStringToAdString(nextBs);
                    setForm((prev) => ({
                      ...prev,
                      registrationDateBs: nextBs,
                      ...(nextAd ? { registrationDateAd: nextAd } : {}),
                    }));
                  }}
                  placeholder="२०७९-०२-०१ वा 2079-02-01"
                />
                <p className="text-[11px] text-[#57534E] mt-1">
                  {parseBsDateInput(form.registrationDateBs)
                    ? form.registrationDateAd
                      ? formatDateBS(form.registrationDateAd, lang)
                      : ''
                    : lang === 'ne'
                    ? 'ढाँचा: YYYY-MM-DD (जस्तै: 2079-02-01)'
                    : 'Format: YYYY-MM-DD (e.g. 2079-02-01)'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'PAN / VAT नम्बर' : 'PAN / VAT Number'}
                </label>
                <Input
                  value={form.panVatNumber}
                  onChange={(e) => setForm({ ...form, panVatNumber: e.target.value })}
                  placeholder="601234567"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5">
                {lang === 'ne' ? 'सहकारीको प्रकार *' : 'Cooperative Type *'}
              </label>
              <Select
                value={form.cooperativeType}
                onChange={(e) => setForm({ ...form, cooperativeType: e.target.value })}
              >
                {Object.entries(COOP_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {lang === 'ne' ? v.ne : v.en}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => handleStepNav(2)}>
                {lang === 'ne' ? 'अर्को चरण →' : 'Next Step →'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">{lang === 'ne' ? 'प्रदेश *' : 'Province *'}</label>
                <Select
                  value={form.province}
                  onChange={(e) => {
                    const nextProv = e.target.value;
                    const firstDist = NEPAL_PROVINCES[nextProv]?.districts[0] || '';
                    setForm({ ...form, province: nextProv, district: firstDist });
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
                <label className="block text-xs font-medium mb-1.5">{lang === 'ne' ? 'जिल्ला *' : 'District *'}</label>
                <Select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })}>
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
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'नगरपालिका / गाउँपालिका *' : 'Municipality *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.municipality}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, municipality: val }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'वडा नं. *' : 'Ward No. *'}
                </label>
                <Input
                  required
                  value={form.wardNumber}
                  onChange={(e) => setForm({ ...form, wardNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'टोल / सडक ठेगाना *' : 'Tole / Street *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.toleAddress}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, toleAddress: val }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'अधिकृत प्रतिनिधिको नाम *' : 'Authorized Representative *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.authorizedRepName}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, authorizedRepName: val }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'पद (Designation) *' : 'Designation *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.authorizedRepDesignation}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, authorizedRepDesignation: val }))}
                  placeholder="अध्यक्ष / व्यवस्थापक"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <label className="border border-dashed border-[#D6D3CD] rounded-lg p-4 cursor-pointer hover:bg-[#FAF9F6] space-y-1">
                <span className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                  <Upload className="w-4 h-4" />
                  {lang === 'ne' ? 'सहकारी लोगो अपलोड' : 'Upload Cooperative Logo'}
                </span>
                <span className="block text-xs text-[#78716C]">
                  {form.logoBase64 ? '✓ Logo selected' : 'PNG / JPG (max 4MB)'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileChange('logoBase64', e.target.files?.[0])}
                />
              </label>

              <label className="border border-dashed border-[#D6D3CD] rounded-lg p-4 cursor-pointer hover:bg-[#FAF9F6] space-y-1">
                <span className="text-xs font-semibold text-[#0F172A] flex items-center gap-1.5">
                  <Upload className="w-4 h-4" />
                  {lang === 'ne' ? 'दर्ता प्रमाणपत्र अपलोड' : 'Upload Registration Document'}
                </span>
                <span className="block text-xs text-[#78716C]">
                  {form.documentFileName || 'PDF / Image (max 4MB)'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileChange('documentBase64', e.target.files?.[0])}
                />
              </label>
            </div>

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                {lang === 'ne' ? '← पछाडि' : '← Back'}
              </Button>
              <Button type="button" onClick={() => handleStepNav(3)}>
                {lang === 'ne' ? 'अर्को चरण →' : 'Next Step →'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'प्रस्तावित पसलको नाम *' : 'Requested Store Name *'}
                </label>
                <NepaliInput
                  required
                  defaultAutoNepali={lang === 'ne'}
                  value={form.requestedStoreName}
                  onValueChange={(val) => setForm((prev) => ({ ...prev, requestedStoreName: val }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'पसल URL Slug' : 'Requested Store URL Slug'}
                </label>
                <Input
                  value={form.requestedSlug}
                  onChange={(e) => setForm({ ...form, requestedSlug: e.target.value })}
                  placeholder="sagarmatha-agro-coop"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'आधिकारिक इमेल' : 'Contact Email'}
                </label>
                <Input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {isBuyerUpgrade
                    ? lang === 'ne'
                      ? 'हालको खाता पासवर्ड पुष्टि गर्नुहोस् *'
                      : 'Confirm Current Account Password *'
                    : lang === 'ne'
                    ? 'पासवर्ड (कम्तीमा ६ अक्षर) *'
                    : 'Account Password (min 6 chars) *'}
                </label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                {isBuyerUpgrade && (
                  <p className="text-[11px] text-[#57534E] mt-1">
                    {lang === 'ne'
                      ? 'हालको खाता पासवर्ड प्रविष्ट गर्नुहोस्। (पासवर्ड बिर्सनुभएको भए तल मोबाइल OTP पठाएर ६-अंकको कोड राखी नयाँ पासवर्ड सेट गर्न पनि मिल्छ।)'
                      : 'Enter your current password — or if forgotten, set a new password here and verify via SMS OTP to your registered phone below.'}
                  </p>
                )}
              </div>
            </div>

            {/* Mobile OTP Section */}
            <div className="p-4 rounded-xl border border-[#E5E2DC] bg-[#FAF9F6] space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
                <ShieldCheck className="w-4 h-4 text-[#15803D]" />
                <span>
                  {lang === 'ne' ? 'मोबाइल नम्बर तथा OTP प्रमाणीकरण (Akash SMS)' : 'Mobile OTP Verification (Akash SMS)'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  required
                  value={form.contactPhone}
                  onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  placeholder="98XXXXXXXX"
                  className="flex-1"
                />
                <Button type="button" variant="outline" disabled={otpSending || !form.contactPhone} onClick={handleSendOtp}>
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
              <div>
                <label className="block text-xs font-medium mb-1">
                  {lang === 'ne' ? '६-अंकको OTP कोड' : '6-Digit OTP Code'}
                </label>
                <Input
                  value={form.otpCode}
                  onChange={(e) => setForm({ ...form, otpCode: e.target.value })}
                  placeholder="123456"
                  className="max-w-xs font-mono"
                />
              </div>
            </div>

            {duplicateUpgradePrompt && !isBuyerUpgrade && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-2.5">
                <div className="flex items-start gap-2 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {lang === 'ne'
                        ? 'यो नम्बर वा इमेल पहिले नै क्रेता खातामा दर्ता भइसकेको छ?'
                        : 'Already Registered This Phone or Email as a Buyer?'}
                    </p>
                    <p className="text-amber-800 leading-relaxed">{duplicateUpgradePrompt}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-6">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate('/login?redirect=/register-cooperative')}
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {lang === 'ne'
                      ? 'लगइन गरेर यही खाता सहकारीमा अपग्रेड गर्नुहोस्'
                      : 'Sign In & Upgrade Existing Account'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                {lang === 'ne' ? '← पछाडि' : '← Back'}
              </Button>
              <Button type="submit" disabled={submitting || isExistingCoopOrAdmin}>
                <CheckCircle2 className="w-4 h-4" />
                {submitting
                  ? lang === 'ne'
                    ? 'पेश हुँदैछ...'
                    : 'Submitting...'
                  : isBuyerUpgrade
                  ? lang === 'ne'
                    ? 'खाता अपग्रेड गरी सहकारी दर्ता गर्नुहोस्'
                    : 'Upgrade Account & Register Cooperative'
                  : lang === 'ne'
                  ? 'दर्ता आवेदन पेश गर्नुहोस्'
                  : 'Submit Cooperative Application'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
