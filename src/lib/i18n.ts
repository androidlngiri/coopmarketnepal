export type Lang = 'ne' | 'en';

export const STATUS_LABELS: Record<string, { ne: string; en: string }> = {
  pending_otp: { ne: 'OTP प्रमाणीकरण बाँकी', en: 'Pending OTP' },
  pending_review: { ne: 'समीक्षा प्रतीक्षारत', en: 'Pending Review' },
  approved: { ne: 'स्वीकृत', en: 'Approved' },
  rejected: { ne: 'अस्वीकृत', en: 'Rejected' },
  suspended: { ne: 'निलम्बित', en: 'Suspended' },
  inactive: { ne: 'निष्क्रिय', en: 'Inactive' },
  pending: { ne: 'प्रतीक्षारत', en: 'Pending' },
  confirmed: { ne: 'पुष्टि भएको', en: 'Confirmed' },
  processing: { ne: 'तयारी हुँदैछ', en: 'Processing' },
  ready_for_dispatch: { ne: 'पठाउन तयार', en: 'Ready for Dispatch' },
  shipped: { ne: 'पठाइसकियो', en: 'Shipped' },
  delivered: { ne: 'डेलिभरी सम्पन्न', en: 'Delivered' },
  cancelled: { ne: 'रद्द गरिएको', en: 'Cancelled' },
  returned: { ne: 'फिर्ता गरिएको', en: 'Returned' },
  refunded: { ne: 'रकम फिर्ता', en: 'Refunded' },
  draft: { ne: 'मस्यौदा', en: 'Draft' },
  published: { ne: 'प्रकाशित', en: 'Published' },
  archived: { ne: 'अभिलेखित', en: 'Archived' },
  trial: { ne: 'परीक्षण अवधि', en: 'Trial' },
  active: { ne: 'सक्रिय', en: 'Active' },
  expired: { ne: 'म्याद समाप्त', en: 'Expired' },
  submitted: { ne: 'पेश गरिएको', en: 'Submitted' },
  verified: { ne: 'प्रमाणित', en: 'Verified' },
  failed: { ne: 'असफल', en: 'Failed' },
};

export const COOP_TYPES: Record<string, { ne: string; en: string }> = {
  agriculture: { ne: 'कृषि सहकारी', en: 'Agriculture Cooperative' },
  dairy: { ne: 'दुग्ध उत्पादक सहकारी', en: 'Dairy Cooperative' },
  multipurpose: { ne: 'बहुउद्देश्यीय सहकारी', en: 'Multipurpose Cooperative' },
  handicraft: { ne: 'हस्तकला तथा सीपमूलक सहकारी', en: 'Handicraft Cooperative' },
  consumer: { ne: 'उपभोक्ता सहकारी', en: 'Consumer Cooperative' },
  savings_credit_producer: { ne: 'उत्पादन तथा बचत सहकारी', en: 'Producer & Credit Cooperative' },
  other: { ne: 'अन्य सहकारी', en: 'Other Cooperative' },
};

export function labelFor(map: Record<string, { ne: string; en: string }>, key: string, lang: Lang): string {
  return map[key]?.[lang] || key;
}

export const DICT = {
  brand: { ne: 'सहकारी बजार', en: 'Sahakari Bazar' },
  navMarketplace: { ne: 'बजार', en: 'Marketplace' },
  navCooperatives: { ne: 'सहकारीहरू', en: 'Cooperatives' },
  navTrackOrder: { ne: 'अर्डर ट्र्याक', en: 'Track Order' },
  navRegisterCoop: { ne: 'सहकारी दर्ता', en: 'Register Coop' },
  navSignIn: { ne: 'प्रवेश', en: 'Sign In' },
  navDashboard: { ne: 'ड्यासबोर्ड', en: 'Dashboard' },
  navAccount: { ne: 'मेरो खाता', en: 'Account' },
  cart: { ne: 'कार्ट', en: 'Cart' },
  checkout: { ne: 'चेकआउट', en: 'Checkout' },
  addToCart: { ne: 'कार्टमा थप्नुहोस्', en: 'Add to Cart' },
  outOfStock: { ne: 'स्टक समाप्त', en: 'Out of Stock' },
  inStock: { ne: 'स्टकमा उपलब्ध', en: 'In Stock' },
  searchPlaceholder: { ne: 'उत्पादन, सहकारी वा जिल्ला खोज्नुहोस्...', en: 'Search products, cooperatives, or districts...' },
  heroTitle: {
    ne: 'नेपालका स्वीकृत सहकारी संस्थाहरूको साझा राष्ट्रिय बजार',
    en: "Nepal's Trusted Marketplace for Verified Cooperative Producers",
  },
  heroSubtitle: {
    ne: 'इलामको अर्गानिक चियादेखि जुम्लाको मार्सी र पाल्पाको ढाकासम्म — बिचौलिया बिना सिधै सहकारीको आधिकारिक अनलाइन पसलबाट खरिद गर्नुहोस्।',
    en: 'Shop directly from independent online storefronts operated by government-registered agricultural, dairy, and handicraft cooperatives across all seven provinces.',
  },
  exploreMarketplace: { ne: 'उत्पादनहरू हेर्नुहोस्', en: 'Browse Products' },
  openCoopStore: { ne: 'सहकारी स्टोर दर्ता गर्नुहोस्', en: 'Register Your Cooperative' },
  featuredCooperatives: { ne: 'स्वीकृत सहकारी पसलहरू', en: 'Verified Cooperative Storefronts' },
  featuredProducts: { ne: 'विशेष सहकारी उत्पादनहरू', en: 'Featured Cooperative Products' },
  allCategories: { ne: 'सबै वर्गहरू', en: 'All Categories' },
  viewStore: { ne: 'पसल हेर्नुहोस्', en: 'Visit Store' },
  save: { ne: 'सुरक्षित गर्नुहोस्', en: 'Save' },
  cancel: { ne: 'रद्द गर्नुहोस्', en: 'Cancel' },
  loading: { ne: 'लोड हुँदैछ...', en: 'Loading...' },
  guestCheckoutNote: {
    ne: 'खाता नखोली नै अतिथि खरिद (Guest Checkout) गर्न सकिन्छ।',
    en: 'No registration required — complete your purchase quickly as a guest.',
  },
};

export function t(key: keyof typeof DICT, lang: Lang): string {
  return DICT[key][lang];
}
