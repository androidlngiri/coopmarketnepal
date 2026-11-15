import { useState } from 'react';
import { CheckCircle2, ShieldCheck, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { NEPAL_PROVINCES } from '../lib/bs-date';
import { COOP_TYPES } from '../lib/i18n';
import { Input, Select } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export function RegisterCooperativePage() {
  const { lang, navigate, refreshSession } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpNotice, setOtpNotice] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await apiFetch<{ cooperative: { id: string; status: string } }>('/api/cooperatives/register', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error || 'दर्ता असफल भयो।');
      return;
    }
    await refreshSession();
    toast.success(
      lang === 'ne'
        ? 'सहकारी दर्ता पेश भयो! सुपर एडमिन समीक्षाको लागि ड्यासबोर्डमा जाँदैछ।'
        : 'Cooperative application submitted!'
    );
    navigate('/cooperative');
  };

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
            onClick={() => setStep(s.num as 1 | 2 | 3)}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'सहकारीको आधिकारिक नाम (नेपाली) *' : 'Official Name (Nepali) *'}
                </label>
                <Input
                  required
                  value={form.nameNe}
                  onChange={(e) => setForm({ ...form, nameNe: e.target.value })}
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
                <Input
                  required
                  value={form.registrationAuthority}
                  onChange={(e) => setForm({ ...form, registrationAuthority: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, registrationDateAd: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'दर्ता मिति (बि.सं.)' : 'Registration Date (BS)'}
                </label>
                <Input
                  value={form.registrationDateBs}
                  onChange={(e) => setForm({ ...form, registrationDateBs: e.target.value })}
                  placeholder="२०७९-०२-०१"
                />
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
              <Button type="button" onClick={() => setStep(2)}>
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
                <Input
                  required
                  value={form.municipality}
                  onChange={(e) => setForm({ ...form, municipality: e.target.value })}
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
                <Input
                  required
                  value={form.toleAddress}
                  onChange={(e) => setForm({ ...form, toleAddress: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'अधिकृत प्रतिनिधिको नाम *' : 'Authorized Representative *'}
                </label>
                <Input
                  required
                  value={form.authorizedRepName}
                  onChange={(e) => setForm({ ...form, authorizedRepName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">
                  {lang === 'ne' ? 'पद (Designation) *' : 'Designation *'}
                </label>
                <Input
                  required
                  value={form.authorizedRepDesignation}
                  onChange={(e) => setForm({ ...form, authorizedRepDesignation: e.target.value })}
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
              <Button type="button" onClick={() => setStep(3)}>
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
                <Input
                  required
                  value={form.requestedStoreName}
                  onChange={(e) => setForm({ ...form, requestedStoreName: e.target.value })}
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
                  {lang === 'ne' ? 'पासवर्ड (कम्तीमा ६ अक्षर) *' : 'Account Password (min 6 chars) *'}
                </label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
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

            <div className="flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                {lang === 'ne' ? '← पछाडि' : '← Back'}
              </Button>
              <Button type="submit" disabled={submitting}>
                <CheckCircle2 className="w-4 h-4" />
                {submitting
                  ? lang === 'ne'
                    ? 'पेश हुँदैछ...'
                    : 'Submitting...'
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
