import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/utils';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

export function AuthPage() {
  const { lang, navigate, refreshSession } = useApp();
  const [tab, setTab] = useState<'login' | 'buyer' | 'setup_admin'>('login');
  const [hasSuperAdmin, setHasSuperAdmin] = useState(true);
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [otpNotice, setOtpNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ identifier: '', password: '', otpCode: '' });
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
        if (!res.data.hasSuperAdmin) {
          // Keep login default, show visible setup notice
        }
      }
    });
  }, []);

  const handleRequestOtp = async () => {
    setOtpNotice('');
    const res = await apiFetch<{ localOtpNotice?: string }>('/api/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone: loginForm.identifier, purpose: 'login' }),
    });
    if (!res.ok) {
      toast.error(res.error || 'OTP पठाउन सकिएन।');
      return;
    }
    if (res.data.localOtpNotice) setOtpNotice(res.data.localOtpNotice);
    else toast.success(lang === 'ne' ? 'OTP पठाइयो।' : 'OTP sent.');
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
    if (role === 'super_admin') navigate('/super-admin');
    else if (role === 'cooperative_admin' || role === 'cooperative_staff') navigate('/cooperative');
    else navigate('/account');
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
    <div className="max-w-md mx-auto px-4 py-12 space-y-6">
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

      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex gap-1 p-1 bg-[#F3F1EC] rounded-lg">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer ${
              tab === 'login' ? 'bg-white text-[#0F172A]' : 'text-[#57534E]'
            }`}
          >
            {lang === 'ne' ? 'लगइन' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setTab('buyer')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer ${
              tab === 'buyer' ? 'bg-white text-[#0F172A]' : 'text-[#57534E]'
            }`}
          >
            {lang === 'ne' ? 'क्रेता दर्ता' : 'Buyer Sign Up'}
          </button>
          {!hasSuperAdmin && (
            <button
              type="button"
              onClick={() => setTab('setup_admin')}
              className={`flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer ${
                tab === 'setup_admin' ? 'bg-white text-[#0F172A]' : 'text-[#57534E]'
              }`}
            >
              {lang === 'ne' ? 'एडमिन सेटअप' : 'Admin Setup'}
            </button>
          )}
        </div>

        {tab === 'login' && (
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
                <label className="block text-xs font-medium mb-1">{lang === 'ne' ? 'पासवर्ड' : 'Password'}</label>
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
                  <Button type="button" variant="outline" onClick={handleRequestOtp}>
                    {lang === 'ne' ? 'OTP पठाउनुहोस्' : 'Send OTP'}
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
  );
}
