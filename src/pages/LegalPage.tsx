import { useApp } from '../context/AppContext';

export function LegalPage({ doc }: { doc: 'about' | 'faq' | 'terms' | 'privacy' }) {
  const { lang } = useApp();

  const content: Record<typeof doc, { titleNe: string; titleEn: string; bodyNe: string[]; bodyEn: string[] }> = {
    about: {
      titleNe: 'सहकारी बजारको बारेमा',
      titleEn: 'About Sahakari Bazar',
      bodyNe: [
        'सहकारी बजार नेपालका दर्ता र स्वीकृत कृषि, दुग्ध, हस्तकला र बहुउद्देश्यीय सहकारी संस्थाहरूलाई एउटै राष्ट्रिय डिजिटल छातामुनि जोड्ने बहु-भाडावाल (Multi-Tenant) SaaS प्लेटफर्म हो।',
        'यहाँ व्यक्तिगत बिक्रेता वा बिचौलियालाई अनुमति छैन। प्रत्येक सहकारीले प्रमाणित दर्ता कागजात र मोबाइल OTP प्रमाणीकरण पश्चात् आफ्नै स्वतन्त्र अनलाइन पसल सञ्चालन गर्दछ।',
      ],
      bodyEn: [
        'Sahakari Bazar is Nepal’s national multi-tenant cooperative marketplace SaaS connecting government-registered agricultural, dairy, and handicraft cooperatives directly with buyers.',
        'Individual non-cooperative sellers cannot list on the platform. Every cooperative undergoes registration verification and mobile OTP authentication before publishing its storefront.',
      ],
    },
    faq: {
      titleNe: 'बारम्बार सोधिने प्रश्नहरू (FAQ)',
      titleEn: 'Frequently Asked Questions',
      bodyNe: [
        'प्र: के खाता नखोली सामान किन्न सकिन्छ? — उ: हो, अतिथि चेकआउट (Guest Checkout) बाट खाता बिना नै अर्डर गर्न र सुरक्षा टोकनबाट अर्डर ट्र्याक गर्न सकिन्छ।',
        'प्र: एउटै कार्टमा फरक सहकारीको सामान राख्दा के हुन्छ? — उ: चेकआउटमा प्रत्येक सहकारीको लागि स्वतः छुट्टाछुट्टै अर्डर र बिल सिर्जना हुन्छ।',
        'प्र: सहकारी पसल कसरी खोल्ने? — उ: "सहकारी दर्ता" पृष्ठमा गई दर्ता नम्बर, कागजात र मोबाइल OTP प्रमाणित गर्नुहोस्। सुपर एडमिन स्वीकृतिपछि तपाईंको पसल प्रकाशित हुनेछ।',
      ],
      bodyEn: [
        'Q: Can I buy without creating an account? — A: Yes, guest checkout is fully supported with secure token-based order tracking.',
        'Q: What happens if my cart contains products from different cooperatives? — A: At checkout, the system automatically splits your cart into separate cooperative orders while providing a single unified checkout.',
        'Q: How do cooperatives join? — A: Submit cooperative registration details and documents on the registration page, verify via Akash SMS OTP, and await Super Admin approval.',
      ],
    },
    terms: {
      titleNe: 'प्रयोगका सर्तहरू',
      titleEn: 'Terms of Service',
      bodyNe: [
        'सहकारी बजारमा केवल नेपाल कानून बमोजिम दर्ता भएका सहकारी संस्थाहरूले मात्र बिक्री खाता सञ्चालन गर्न पाउनेछन्।',
        'प्रत्येक सहकारी आफ्नो उत्पादनको गुणस्तर, मूल्य, स्टक र समयमै डेलिभरीका लागि स्वयं जिम्मेवार हुनेछ। निषेधित वस्तुहरू (मदिरा, सुर्ती, हतियार आदि) बिक्री गर्न पूर्ण प्रतिबन्ध छ।',
      ],
      bodyEn: [
        'Only legally registered cooperatives in Nepal may operate seller storefronts on Sahakari Bazar.',
        'Each cooperative is solely responsible for product quality, accurate inventory, tax compliance, and order fulfillment. Prohibited items are strictly barred.',
      ],
    },
    privacy: {
      titleNe: 'गोपनीयता नीति',
      titleEn: 'Privacy Policy',
      bodyNe: [
        'हामी क्रेताबाट डेलिभरीका लागि अत्यावश्यक विवरण (नाम, फोन र ठेगाना) मात्र संकलन गर्छौं।',
        'सबै सहकारीको निजी डाटा, अर्डर र ग्राहक विवरण Row-Level Security (RLS) तथा टेनेन्ट आइसोलेसनद्वारा सुरक्षित राखिएको छ — एक सहकारीले अर्को सहकारीको निजी विवरण हेर्न सक्दैन।',
      ],
      bodyEn: [
        'We collect only the minimum buyer information required for order fulfillment and delivery verification.',
        'All cooperative tenant records are isolated via strict server-side authorization and PostgreSQL Row Level Security so Cooperative A can never access Cooperative B’s private records.',
      ],
    },
  };

  const entry = content[doc];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <h1 className="font-display text-3xl font-bold text-[#0F172A] border-b border-[#E5E2DC] pb-4">
        {lang === 'ne' ? entry.titleNe : entry.titleEn}
      </h1>
      <div className="bg-white border border-[#E5E2DC] rounded-xl p-6 sm:p-8 space-y-4 text-sm text-[#57534E] leading-relaxed">
        {(lang === 'ne' ? entry.bodyNe : entry.bodyEn).map((para, idx) => (
          <p key={idx}>{para}</p>
        ))}
      </div>
    </div>
  );
}
