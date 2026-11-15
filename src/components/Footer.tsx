import { useApp } from '../context/AppContext';
import { formatDateBS } from '../lib/bs-date';
import { t } from '../lib/i18n';

export function Footer() {
  const { lang, navigate } = useApp();
  const todayBs = formatDateBS(new Date(), lang);

  return (
    <footer className="border-t border-[#E5E2DC] bg-white mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2 space-y-3">
          <p className="font-display text-lg font-bold text-[#0F172A]">{t('brand', lang)}</p>
          <p className="text-sm text-[#57534E] max-w-md leading-relaxed">
            {lang === 'ne'
              ? 'नेपालभरका दर्ता र स्वीकृत सहकारी संस्थाहरूलाई स्वतन्त्र अनलाइन स्टोर, इन्भेन्टरी र बहु-बिक्रेता बजार प्रणाली प्रदान गर्ने राष्ट्रिय SaaS प्लेटफर्म।'
              : "Nepal's national multi-tenant SaaS platform empowering verified cooperatives with independent storefronts, inventory control, and nationwide direct commerce."}
          </p>
          <p className="text-xs text-[#78716C] tabular-nums">
            {lang === 'ne' ? `आजको मिति: ${todayBs} · समय क्षेत्र: Asia/Kathmandu` : `Date: ${todayBs} · Timezone: Asia/Kathmandu`}
          </p>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'प्लेटफर्म' : 'Platform'}</p>
          <ul className="space-y-2 text-[#57534E]">
            <li>
              <a
                href="/marketplace"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/marketplace');
                }}
                className="hover:text-[#0F172A]"
              >
                {t('navMarketplace', lang)}
              </a>
            </li>
            <li>
              <a
                href="/cooperatives"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/cooperatives');
                }}
                className="hover:text-[#0F172A]"
              >
                {t('navCooperatives', lang)}
              </a>
            </li>
            <li>
              <a
                href="/register-cooperative"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/register-cooperative');
                }}
                className="hover:text-[#0F172A]"
              >
                {t('navRegisterCoop', lang)}
              </a>
            </li>
            <li>
              <a
                href="/track-order"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/track-order');
                }}
                className="hover:text-[#0F172A]"
              >
                {t('navTrackOrder', lang)}
              </a>
            </li>
          </ul>
        </div>

        <div className="space-y-2.5 text-sm">
          <p className="font-semibold text-[#0F172A]">{lang === 'ne' ? 'जानकारी तथा नीति' : 'Legal & Help'}</p>
          <ul className="space-y-2 text-[#57534E]">
            <li>
              <a
                href="/about"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/about');
                }}
                className="hover:text-[#0F172A]"
              >
                {lang === 'ne' ? 'हाम्रो बारेमा' : 'About Platform'}
              </a>
            </li>
            <li>
              <a
                href="/faq"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/faq');
                }}
                className="hover:text-[#0F172A]"
              >
                {lang === 'ne' ? 'बारम्बार सोधिने प्रश्न' : 'FAQ'}
              </a>
            </li>
            <li>
              <a
                href="/terms"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/terms');
                }}
                className="hover:text-[#0F172A]"
              >
                {lang === 'ne' ? 'प्रयोगका सर्तहरू' : 'Terms of Service'}
              </a>
            </li>
            <li>
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/privacy');
                }}
                className="hover:text-[#0F172A]"
              >
                {lang === 'ne' ? 'गोपनीयता नीति' : 'Privacy Policy'}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[#E5E2DC] py-4 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#78716C]">
          <span>
            {lang === 'ne'
              ? '© २०८३ सहकारी बजार नेपाल। सर्वाधिकार सुरक्षित।'
              : '© 2026 Sahakari Bazar Nepal. All rights reserved.'}
          </span>
          <span>{lang === 'ne' ? 'मुद्रा: नेपाली रुपैयाँ (रु. NPR)' : 'Currency: Nepalese Rupee (NPR)'}</span>
        </div>
      </div>
    </footer>
  );
}
