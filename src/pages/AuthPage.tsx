import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LogIn, ShieldAlert, ShoppingBag, Store, UserPlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export function AuthPage() {
  const { lang, user, logout, navigate, refreshSession, currentPath } = useApp();
  const [tab, setTab] = useState<'login' | 'buyer' | 'setup_admin'>(() => {
    const tParam = new URLSearchParams(window.location.search).get('tab');
    return tParam === 'buyer' ? 'buyer' : 'login';
  });
  const [hasSuperAdmin, setHasSuperAdmin] = useState(true);
  const [loginMode, setLoginMode] = useState<'password' | 'otp' | 'reset'>('password');
  const [otpSending, setOtpSending] = useState(false);
  const [otpNotice, setOtpNotice] = useState('');
  const [resetMaskedPhone, setResetMaskedPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ identifier: '', password: '', otpCode: '' });
  const [resetForm, setResetForm] = useState({ identifier: '', otpCode: '', newPassword: '', confirmPassword: '' });
  const [buyerForm, setBuyerForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [adminForm, setAdminForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    bootstrapSecret: '',
  });

  useEffect(() => {
    apiFetch<{ hasSuperAdmin: boolean }>('/api/auth/bootstrap-status').then((res) => {
      if (res.ok) {
        setHasSuperAdmin(res.data.hasSuperAdmin);
      }
    });
  }, []);

  useEffect(() => {
    const tParam = new URLSearchParams(window.location.search).get('tab');
    if (tParam === 'buyer') setTab('buyer');
    else if (tParam === 'login') setTab('login');
  }, [currentPath]);

  const redirectParam = new URLSearchParams(window.location.search).get('redirect') || '';
  const safeRedirect = redirectParam.startsWith('/') && !redirectParam.startsWith('//') ? redirectParam : null;

  if (user) {
    const dashboardPath =
      user.role === 'super_admin'
        ? '/super-admin'
        : user.role === 'cooperative_admin' || user.role === 'cooperative_staff'
        ? '/cooperative'
        : safeRedirect || '/account';

    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 space-y-4 text-center">
          <p className="text-xs font-medium text-[#15803D]">
            {lang === 'ne' ? 'तपाईं पहिले नै लगइन हुनुहुन्छ' : 'You are currently signed in'}
          </p>
          <h1 className="font-display text-xl font-bold text-[#0F172A]">{user.full_name}</h1>
          <p className="text-xs text-[#57534E]">
            {user.email || user.phone} · {user.role}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button className="flex-1" onClick={() => navigate(dashboardPath)}>
              {safeRedirect === '/register-cooperative' && user.role === 'buyer'
                ? lang === 'ne'
                  ? 'सहकारी दर्तामा जानुहोस्'
                  : 'Continue to Cooperative Registration'
                : lang === 'ne'
                ? 'ड्यासबोर्डमा जानुहोस्'
                : 'Go to Dashboard'}
            </Button>
            <Button variant="outline" className="flex-1" onClick={logout}>
              {lang === 'ne' ? 'बाहिर निस्कनुहोस्' : 'Sign Out'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleRequestOtp = async () => {
    if (!loginForm.identifier.trim()) {
      toast.error(lang === 'ne' ? 'कृपया मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' : 'Please enter your mobile number.');
      return;
    }
    setOtpSending(true);
    setOtpNotice('');
    const res = await apiFetch<{ localOtpNotice?: string }>('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: loginForm.identifier, purpose: 'login' }),
    });
    setOtpSending(false);
    if (!res.ok) {
      toast.error(res.error || 'OTP पठाउन सकिएन।');
      return;
    }
    if (res.data.localOtpNotice) setOtpNotice(res.data.localOtpNotice);
    else toast.success(lang === 'ne' ? 'OTP पठाइयो।' : 'OTP sent.');
  };

  const handleRequestResetOtp = async () => {
    if (!resetForm.identifier.trim()) {
      toast.error(
        lang === 'ne' ? 'कृपया दर्ता भएको इमेल वा मोबाइल नम्बर प्रविष्ट गर्नुहोस्।' : 'Please enter your registered email or mobile number.'
      );
      return;
    }
    setOtpSending(true);
    setOtpNotice('');
    setResetMaskedPhone('');
    const res = await apiFetch<{ maskedPhone?: string; localOtpNotice?: string }>('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify({ identifier: resetForm.identifier }),
    });
    setOtpSending(false);
    if (!res.ok) {
      toast.error(res.error || 'OTP पठाउन सकिएन।');
      return;
    }
    if (res.data.maskedPhone) {
      setResetMaskedPhone(res.data.maskedPhone);
    }
    if (res.data.localOtpNotice) {
      setOtpNotice(res.data.localOtpNotice);
    } else {
      toast.success(
        lang === 'ne'
          ? `तपाईंको मोबाइल नम्बर (${res.data.maskedPhone || ''}) मा पासवर्ड रिसेट OTP पठाइयो।`
          : `Password reset OTP sent to ${res.data.maskedPhone || 'your mobile'}.`
      );
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetForm.newPassword.length < 6) {
      toast.error(lang === 'ne' ? 'नयाँ पासवर्ड कम्तीमा ६ अक्षरको हुनुपर्छ।' : 'Password must be at least 6 characters.');
      return;
    }
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      toast.error(lang === 'ne' ? 'नयाँ पासवर्ड र पुष्टि पासवर्ड मिलेन।' : 'Passwords do not match.');
      return;
    }
    setLoading(true);
    const res = await apiFetch<{ user: { role: string } }>('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({
        identifier: resetForm.identifier,
        otpCode: resetForm.otpCode,
        newPassword: resetForm.newPassword,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || 'पासवर्ड रिसेट असफल भयो।');
      return;
    }
    await refreshSession();
    toast.success(lang === 'ne' ? 'पासवर्ड सफलतापूर्वक परिवर्तन गरी प्रवेश भयो!' : 'Password updated and signed in!');
    const role = res.data.user.role;
    if (safeRedirect && (role === 'buyer' || safeRedirect !== '/register-cooperative')) {
      navigate(safeRedirect);
    } else if (role === 'super_admin') {
      navigate('/super-admin');
    } else if (role === 'cooperative_admin' || role === 'cooperative_staff') {
      navigate('/cooperative');
    } else {
      navigate('/account');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await apiFetch<{ user: { role: string } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: loginForm.identifier,
        password: loginForm.password,
        otpCode: loginForm.otpCode,
        mode: loginMode,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || 'प्रवेश असफल भयो।');
      return;
    }
    await refreshSession();
    toast.success(lang === 'ne' ? 'सफलतापूर्वक प्रवेश भयो।' : 'Signed in successfully.');
    const role = res.data.user.role;
    if (safeRedirect && (role === 'buyer' || safeRedirect !== '/register-cooperative')) {
      navigate(safeRedirect);
    } else if (role === 'super_admin') {
      navigate('/super-admin');
    } else if (role === 'cooperative_admin' || role === 'cooperative_staff') {
      navigate('/cooperative');
    } else {
      navigate('/account');
    }
  };

  const handleRegisterBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await apiFetch('/api/auth/register-buyer', {
      method: 'POST',
      body: JSON.stringify(buyerForm),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || 'खाता खोल्न सकिएन।');
      return;
    }
    await refreshSession();
    toast.success(lang === 'ne' ? 'क्रेता खाता सिर्जना भयो!' : 'Buyer account created!');
    navigate('/account');
  };

  const handleProvisionAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await apiFetch('/api/auth/bootstrap-admin', {
      method: 'POST',
      body: JSON.stringify(adminForm),
    });
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error || 'सुपर एडमिन सिर्जना असफल भयो।');
      return;
    }
    await refreshSession();
    toast.success(lang === 'ne' ? 'सुपर एडमिन खाता तयार भयो!' : 'Super Admin provisioned!');
    navigate('/super-admin');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {!hasSuperAdmin && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="w-4 h-4" />
            <span>
              {lang === 'ne'
                ? 'प्रारम्भिक सुपर एडमिन सेटअप आवश्यक छ'
                : 'Initial Platform Super-Admin Setup Required'}
            </span>
          </div>
          <p className="text-xs text-amber-800">
            {lang === 'ne'
              ? 'सुरक्षाका लागि कुनै पूर्व-निर्धारित पासवर्ड राखिएको छैन। पहिलो प्लेटफर्म सञ्चालक खाता सिर्जना गर्नुहोस्।'
              : 'No hardcoded default credentials exist. Provision your initial Super-Admin account now.'}
          </p>
          <Button size="sm" variant="secondary" onClick={() => setTab('setup_admin')}>
            {lang === 'ne' ? 'सुपर एडमिन खाता बनाउनुहोस्' : 'Provision Super Admin'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Crystal-Clear Role & Onboarding Guide */}
        <div className="lg:col-span-5 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#B91C1C]">
              {lang === 'ne' ? 'सहकारी बजार प्रवेश र दर्ता मार्गदर्शक' : 'Sign In & Onboarding Guide'}
            </p>
            <h2 className="font-display text-2xl font-bold text-[#0F172A]">
              {lang === 'ne' ? 'तपाईं कुन भूमिकामा आबद्ध हुन चाहनुहुन्छ?' : 'How would you like to continue?'}
            </h2>
            <p className="text-xs text-[#57534E] leading-relaxed">
              {lang === 'ne'
                ? 'तपाईंको उद्देश्य अनुसार तलका फरक विकल्पहरू छान्नुहोस्।'
                : 'Choose the distinct path that matches what you want to do on Sahakari Bazar.'}
            </p>
          </div>

          {/* Card 1: Buyer */}
          <div
            className={`rounded-xl border p-5 space-y-3 transition-colors ${
              tab === 'buyer'
                ? 'border-[#0F172A] bg-white shadow-sm'
                : 'border-[#E5E2DC] bg-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0F172A]/10 text-[#0F172A] flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  {lang === 'ne' ? '१. क्रेता / ग्राहक (Buyer)' : '1. Shopper / Buyer'}
                </h3>
                <p className="text-[11px] text-[#57534E]">
                  {lang === 'ne' ? 'उत्पादन खरिद र अर्डर ट्र्याक गर्न' : 'For buying local products & tracking orders'}
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-[#57534E]">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  {lang === 'ne'
                    ? 'अर्डर इतिहास, ठेगाना र मनपर्ने उत्पादन (Wishlist) सुरक्षित राख्नुहोस्।'
                    : 'Save delivery addresses, view invoices, reorder, and save wishlists.'}
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  {lang === 'ne'
                    ? 'नोट: खाता नखोली नै सिधै Guest Checkout बाट पनि किन्न सकिन्छ।'
                    : 'Note: You can also buy directly via Guest Checkout without registering.'}
                </span>
              </li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={tab === 'login' ? 'default' : 'outline'}
                onClick={() => setTab('login')}
              >
                <LogIn className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'पहिले नै खाता छ (Sign In)' : 'Existing User Sign In'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tab === 'buyer' ? 'secondary' : 'outline'}
                onClick={() => setTab('buyer')}
              >
                <UserPlus className="w-3.5 h-3.5" />
                {lang === 'ne' ? 'नयाँ क्रेता दर्ता' : 'New Buyer Sign Up'}
              </Button>
            </div>
          </div>

          {/* Card 2: Cooperative Seller */}
          <div className="rounded-xl border border-[#B91C1C]/30 bg-[#FAF9F6] p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#B91C1C]/10 text-[#B91C1C] flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  {lang === 'ne' ? '२. सहकारी संस्था / विक्रेता (Cooperative Seller)' : '2. Cooperative Storefront Seller'}
                </h3>
                <p className="text-[11px] text-[#57534E]">
                  {lang === 'ne' ? 'आफ्नै अनलाइन पसल खोली उत्पादन बेच्न' : 'Launch your verified cooperative storefront'}
                </p>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-[#57534E]">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  {lang === 'ne'
                    ? 'बिचौलिया बिना नेपालभर प्रत्यक्ष अनलाइन बिक्री र अर्डर व्यवस्थापन।'
                    : 'Sell directly nationwide with zero middlemen & instant SMS order alerts.'}
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                <span>
                  {lang === 'ne'
                    ? 'AI बाट १ क्लिकमै पसल र उत्पादन विवरण तयार हुने सुविधा।'
                    : 'AI Smart Prefill drafts store profiles & product pages in seconds.'}
                </span>
              </li>
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" size="sm" onClick={() => navigate('/register-cooperative')}>
                <Store className="w-3.5 h-3.5" />
                <span>{lang === 'ne' ? 'नयाँ सहकारी दर्ता गर्नुहोस्' : 'Register New Cooperative'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Focused Sign In / Sign Up Form Card */}
        <div className="lg:col-span-7 bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex gap-1.5 p-1 bg-[#F3F1EC] rounded-lg">
            <button
              type="button"
              onClick={() => setTab('login')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                tab === 'login' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#57534E] hover:text-[#0F172A]'
              }`}
            >
              {lang === 'ne' ? 'साइन इन / लगइन (Sign In)' : 'Sign In (All Roles)'}
            </button>
            <button
              type="button"
              onClick={() => setTab('buyer')}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                tab === 'buyer' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#57534E] hover:text-[#0F172A]'
              }`}
            >
              {lang === 'ne' ? 'नयाँ क्रेता दर्ता (Buyer)' : 'New Buyer Sign Up'}
            </button>
            {!hasSuperAdmin && (
              <button
                type="button"
                onClick={() => setTab('setup_admin')}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  tab === 'setup_admin' ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#57534E]'
                }`}
              >
                {lang === 'ne' ? 'एडमिन सेटअप' : 'Admin Setup'}
              </button>
            )}
          </div>

        {tab === 'login' && loginMode === 'reset' && (
          <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
            <div className="flex justify-between items-center gap-2">
              <h1 className="font-display text-xl font-bold text-[#0F172A]">
                {lang === 'ne' ? 'पासवर्ड रिसेट गर्नुहोस्' : 'Reset Forgotten Password'}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setLoginMode('password');
                  setOtpNotice('');
                }}
                className="text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer shrink-0"
              >
                {lang === 'ne' ? '← लगइनमा फर्कनुहोस्' : '← Back to Sign In'}
              </button>
            </div>
            <p className="text-xs text-[#57534E]">
              {lang === 'ne'
                ? 'तपाईंको खातामा दर्ता भएको इमेल वा मोबाइल नम्बर हाल्नुहोस्। दर्ता भएको मोबाइल नम्बरमा ६-अंकको OTP आउनेछ।'
                : 'Enter your registered email or mobile number. We will send a 6-digit SMS OTP to your registered mobile.'}
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-medium">
                {lang === 'ne' ? 'दर्ता इमेल वा मोबाइल नम्बर *' : 'Registered Email or Mobile *'}
              </label>
              <div className="flex gap-2">
                <Input
                  required
                  value={resetForm.identifier}
                  onChange={(e) => setResetForm({ ...resetForm, identifier: e.target.value })}
                  placeholder="email@coop.np or 98XXXXXXXX"
                />
                <Button type="button" variant="outline" disabled={otpSending} onClick={handleRequestResetOtp}>
                  {otpSending
                    ? lang === 'ne'
                      ? 'पठाउँदै...'
                      : 'Sending...'
                    : lang === 'ne'
                    ? 'OTP पठाउनुहोस्'
                    : 'Send OTP'}
                </Button>
              </div>
              {resetMaskedPhone && (
                <p className="text-xs text-[#15803D] font-medium">
                  {lang === 'ne'
                    ? `मोबाइल नम्बर ${resetMaskedPhone} मा OTP पठाइयो।`
                    : `OTP sent to ${resetMaskedPhone}.`}
                </p>
              )}
              {otpNotice && <p className="text-xs text-[#B91C1C] font-mono">{otpNotice}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? '६-अंकको SMS OTP कोड *' : '6-Digit SMS OTP Code *'}
              </label>
              <Input
                required
                value={resetForm.otpCode}
                onChange={(e) => setResetForm({ ...resetForm, otpCode: e.target.value })}
                placeholder="123456"
                className="font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'नयाँ पासवर्ड (कम्तीमा ६ अक्षर) *' : 'New Password (min 6 chars) *'}
              </label>
              <Input
                type="password"
                required
                minLength={6}
                value={resetForm.newPassword}
                onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'नयाँ पासवर्ड पुनः लेख्नुहोस् *' : 'Confirm New Password *'}
              </label>
              <Input
                type="password"
                required
                minLength={6}
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? lang === 'ne'
                  ? 'अद्यावधिक हुँदैछ...'
                  : 'Updating...'
                : lang === 'ne'
                ? 'नयाँ पासवर्ड सेट गरी प्रवेश गर्नुहोस्'
                : 'Reset Password & Sign In'}
            </Button>
          </form>
        )}

        {tab === 'login' && loginMode !== 'reset' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="flex justify-between items-center">
              <h1 className="font-display text-xl font-bold text-[#0F172A]">
                {lang === 'ne' ? 'खातामा प्रवेश गर्नुहोस्' : 'Sign In to Sahakari Bazar'}
              </h1>
              <button
                type="button"
                onClick={() => setLoginMode((m) => (m === 'password' ? 'otp' : 'password'))}
                className="text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer"
              >
                {loginMode === 'password'
                  ? lang === 'ne'
                    ? 'OTP बाट प्रवेश'
                    : 'Use Mobile OTP'
                  : lang === 'ne'
                  ? 'पासवर्डबाट प्रवेश'
                  : 'Use Password'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'इमेल वा मोबाइल नम्बर' : 'Email or Mobile Number'}
              </label>
              <Input
                required
                value={loginForm.identifier}
                onChange={(e) => setLoginForm({ ...loginForm, identifier: e.target.value })}
                placeholder="email@coop.np or 98XXXXXXXX"
              />
            </div>

            {loginMode === 'password' ? (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium">{lang === 'ne' ? 'पासवर्ड' : 'Password'}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetForm((prev) => ({ ...prev, identifier: prev.identifier || loginForm.identifier }));
                      setOtpNotice('');
                      setResetMaskedPhone('');
                      setLoginMode('reset');
                    }}
                    className="text-xs font-medium text-[#B91C1C] hover:underline cursor-pointer"
                  >
                    {lang === 'ne' ? 'पासवर्ड बिर्सनुभयो?' : 'Forgot password?'}
                  </button>
                </div>
                <Input
                  type="password"
                  required
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    required
                    value={loginForm.otpCode}
                    onChange={(e) => setLoginForm({ ...loginForm, otpCode: e.target.value })}
                    placeholder="6-digit OTP"
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" disabled={otpSending} onClick={handleRequestOtp}>
                    {otpSending ? (lang === 'ne' ? 'पठाउँदै...' : 'Sending...') : lang === 'ne' ? 'OTP पठाउनुहोस्' : 'Send OTP'}
                  </Button>
                </div>
                {otpNotice && <p className="text-xs text-[#B91C1C] font-mono">{otpNotice}</p>}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (lang === 'ne' ? 'प्रवेश हुँदैछ...' : 'Signing in...') : lang === 'ne' ? 'प्रवेश गर्नुहोस्' : 'Sign In'}
            </Button>

            <div className="pt-3 border-t border-[#E5E2DC] text-center text-xs text-[#57534E]">
              {lang === 'ne' ? 'सहकारी संस्था बिक्री गर्न चाहनुहुन्छ?' : 'Want to sell as a cooperative?'}{' '}
              <button
                type="button"
                onClick={() => navigate('/register-cooperative')}
                className="text-[#B91C1C] font-semibold hover:underline cursor-pointer"
              >
                {lang === 'ne' ? 'सहकारी दर्ता गर्नुहोस्' : 'Register Cooperative'}
              </button>
            </div>
          </form>
        )}

        {tab === 'buyer' && (
          <form onSubmit={handleRegisterBuyer} className="space-y-4">
            <h1 className="font-display text-xl font-bold text-[#0F172A]">
              {lang === 'ne' ? 'ऐच्छिक क्रेता खाता खोल्नुहोस्' : 'Create Optional Buyer Account'}
            </h1>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पूरा नाम *' : 'Full Name *'}</label>
              <Input
                required
                value={buyerForm.fullName}
                onChange={(e) => setBuyerForm({ ...buyerForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'मोबाइल नम्बर' : 'Mobile Number'}</label>
              <Input
                value={buyerForm.phone}
                onChange={(e) => setBuyerForm({ ...buyerForm, phone: e.target.value })}
                placeholder="98XXXXXXXX"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'इमेल' : 'Email'}</label>
              <Input
                type="email"
                value={buyerForm.email}
                onChange={(e) => setBuyerForm({ ...buyerForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पासवर्ड *' : 'Password *'}</label>
              <Input
                type="password"
                required
                minLength={6}
                value={buyerForm.password}
                onChange={(e) => setBuyerForm({ ...buyerForm, password: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {lang === 'ne' ? 'खाता खोल्नुहोस्' : 'Create Account'}
            </Button>
          </form>
        )}

        {tab === 'setup_admin' && (
          <form onSubmit={handleProvisionAdmin} className="space-y-4">
            <h1 className="font-display text-xl font-bold text-[#0F172A]">
              {lang === 'ne' ? 'सुपर एडमिन प्रारम्भिक सेटअप' : 'Provision Platform Super Admin'}
            </h1>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पूरा नाम *' : 'Full Name *'}</label>
              <Input
                required
                value={adminForm.fullName}
                onChange={(e) => setAdminForm({ ...adminForm, fullName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'इमेल *' : 'Email *'}</label>
              <Input
                type="email"
                required
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'मोबाइल नम्बर' : 'Mobile Number'}</label>
              <Input
                value={adminForm.phone}
                onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                placeholder="98XXXXXXXX"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                {lang === 'ne' ? 'सबल पासवर्ड (कम्तीमा ८ अक्षर) *' : 'Strong Password (min 8 chars) *'}
              </label>
              <Input
                type="password"
                required
                minLength={8}
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {lang === 'ne' ? 'सुपर एडमिन सिर्जना गर्नुहोस्' : 'Create Super Admin'}
            </Button>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}

