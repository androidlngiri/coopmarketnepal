import { useEffect, useState } from 'react';
import { LogIn, LogOut, Menu, ShoppingBag, Store, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { t } from '../lib/i18n';
import { toNepaliDigits } from '../lib/bs-date';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const { lang, setLang, user, logout, navigate, currentPath, cartCount, setCartOpen } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dashboardPath =
    user?.role === 'super_admin'
      ? '/super-admin'
      : user?.role === 'cooperative_admin' || user?.role === 'cooperative_staff'
      ? '/cooperative'
      : '/account';

  const canRegisterCoop = !user || user.role === 'buyer';

  const navItems = [
    { path: '/marketplace', label: t('navMarketplace', lang) },
    { path: '/cooperatives', label: t('navCooperatives', lang) },
    { path: '/track-order', label: t('navTrackOrder', lang) },
    ...(user?.role === 'buyer' ? [{ path: '/register-cooperative', label: t('navRegisterCoop', lang) }] : []),
  ];

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentPath]);

  const handleNav = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  const isDashboardActive =
    currentPath.startsWith('/account') ||
    currentPath.startsWith('/cooperative') ||
    currentPath.startsWith('/super-admin');

  const isLoginActive = !user && currentPath.startsWith('/login');
  const isRegisterCoopActive = currentPath.startsWith('/register-cooperative');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[#E5E2DC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleNav('/');
          }}
          className="font-display text-xl font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0"
        >
          {t('brand', lang)}
        </a>

        {/* Zone 2: Concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#57534E]">
          {navItems.map((item) => {
            const active = currentPath.startsWith(item.path);
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  handleNav(item.path);
                }}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  active
                    ? 'border-[#B91C1C] text-[#0F172A] font-semibold'
                    : 'border-transparent hover:text-[#0F172A] hover:border-[#D6D3CD]'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Language toggle, Bell (when signed in), Cart trigger, Distinct Auth/Dashboard CTAs */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setLang(lang === 'ne' ? 'en' : 'ne')}
            className="h-9 px-2.5 text-xs font-medium rounded-lg border border-[#E5E2DC] text-[#0F172A] hover:bg-[#F3F1EC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Switch language"
          >
            {lang === 'ne' ? 'EN' : 'नेपाली'}
          </button>

          {user && <NotificationBell />}

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative h-9 px-3 rounded-lg border border-[#E5E2DC] text-[#0F172A] hover:bg-[#F3F1EC] transition-colors inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={t('cart', lang)}
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="tabular-nums">
              {lang === 'ne' ? toNepaliDigits(cartCount) : cartCount}
            </span>
          </button>

          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNav(dashboardPath)}
                className={`hidden sm:inline-flex h-9 px-4 rounded-lg text-white transition-colors items-center text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  isDashboardActive ? 'bg-[#0F172A] ring-2 ring-[#B91C1C]/30' : 'bg-[#B91C1C] hover:bg-[#991B1B]'
                }`}
              >
                {user.role === 'buyer' ? t('navAccount', lang) : t('navDashboard', lang)}
              </button>
              <button
                type="button"
                onClick={logout}
                title={lang === 'ne' ? 'बाहिर निस्कनुहोस् (Sign Out)' : 'Sign Out'}
                aria-label={lang === 'ne' ? 'बाहिर निस्कनुहोस्' : 'Sign Out'}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E2DC] text-[#57534E] hover:text-[#B91C1C] hover:bg-[#F3F1EC] transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handleNav('/login')}
                className={`hidden sm:inline-flex h-9 px-3.5 rounded-lg border transition-colors items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  isLoginActive
                    ? 'border-[#0F172A] bg-[#0F172A] text-white'
                    : 'border-[#D6D3CD] bg-white text-[#0F172A] hover:bg-[#F3F1EC]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{lang === 'ne' ? 'साइन इन' : 'Sign In'}</span>
              </button>
              {canRegisterCoop && (
                <button
                  type="button"
                  onClick={() => handleNav('/register-cooperative')}
                  className={`hidden sm:inline-flex h-9 px-3.5 rounded-lg text-white transition-colors items-center gap-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                    isRegisterCoopActive ? 'bg-[#0F172A]' : 'bg-[#B91C1C] hover:bg-[#991B1B]'
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>{lang === 'ne' ? 'सहकारी दर्ता' : 'Register Coop'}</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[#E5E2DC] text-[#0F172A] cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#E5E2DC] bg-white px-4 py-4 space-y-2">
          {navItems.map((item) => {
            const active = currentPath.startsWith(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => handleNav(item.path)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium ${
                  active ? 'bg-[#FAF9F6] text-[#B91C1C] font-semibold' : 'text-[#0F172A] hover:bg-[#F3F1EC]'
                }`}
              >
                {item.label}
              </button>
            );
          })}

          {user ? (
            <>
              <button
                type="button"
                onClick={() => handleNav(dashboardPath)}
                className="block w-full text-center px-3 py-2.5 rounded-lg text-sm font-medium bg-[#B91C1C] text-white"
              >
                {user.role === 'buyer' ? t('navAccount', lang) : t('navDashboard', lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="flex w-full items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-[#E5E2DC] text-[#57534E] hover:text-[#B91C1C]"
              >
                <LogOut className="w-4 h-4" />
                <span>{lang === 'ne' ? 'बाहिर निस्कनुहोस् (Sign Out)' : 'Sign Out'}</span>
              </button>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleNav('/login')}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold border border-[#D6D3CD] text-[#0F172A] bg-white"
              >
                <LogIn className="w-4 h-4" />
                <span>{lang === 'ne' ? 'साइन इन' : 'Sign In'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleNav('/register-cooperative')}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-[#B91C1C] text-white"
              >
                <Store className="w-4 h-4" />
                <span>{lang === 'ne' ? 'सहकारी दर्ता' : 'Register Coop'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

