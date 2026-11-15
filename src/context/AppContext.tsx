import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch } from '../lib/utils';
import type { Lang } from '../lib/i18n';

export interface AuthUser {
  id: string;
  full_name: string;
  full_name_ne: string | null;
  email: string | null;
  phone: string | null;
  role: 'super_admin' | 'cooperative_admin' | 'cooperative_staff' | 'buyer';
  preferred_language: Lang;
  cooperative_id?: string | null;
  cooperative_status?: string | null;
  permissions?: Record<string, boolean>;
}

export interface CooperativeSummary {
  id: string;
  slug: string;
  name_ne: string;
  name_en: string;
  status: string;
  logo_url?: string | null;
  province?: string;
  district?: string;
}

export interface CartItem {
  productId: string;
  slug: string;
  cooperativeId: string;
  cooperativeSlug: string;
  storeNameNe: string;
  storeNameEn: string;
  nameNe: string;
  nameEn: string;
  priceNpr: number;
  discountPriceNpr: number | null;
  unitLabelNe: string;
  unitLabelEn: string;
  imageUrl: string;
  quantity: number;
  stockQuantity: number;
}

interface AppContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  user: AuthUser | null;
  cooperative: CooperativeSummary | null;
  unreadNotifications: number;
  authLoading: boolean;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  currentPath: string;
  navigate: (path: string) => void;
  cart: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  updateCartQty: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  cartCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

const CART_STORAGE_KEY = 'sahakari_bazar_cart_v1';
const LANG_STORAGE_KEY = 'sahakari_bazar_lang';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' ? 'en' : 'ne';
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [cooperative, setCooperative] = useState<CooperativeSummary | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname + window.location.search);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((path: string) => {
    if (path !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, []);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      localStorage.setItem(LANG_STORAGE_KEY, next);
      document.documentElement.lang = next;
      if (user) {
        apiFetch('/api/auth/language', {
          method: 'PATCH',
          body: JSON.stringify({ language: next }),
        }).catch(() => undefined);
      }
    },
    [user]
  );

  const refreshSession = useCallback(async () => {
    setAuthLoading(true);
    const res = await apiFetch<{
      user: AuthUser | null;
      cooperative: CooperativeSummary | null;
      unreadNotifications: number;
    }>('/api/auth/me');
    if (res.ok) {
      setUser(res.data.user);
      setCooperative(res.data.cooperative);
      setUnreadNotifications(res.data.unreadNotifications || 0);
    }
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCooperative(null);
    setUnreadNotifications(0);
    navigate('/');
  }, [navigate]);

  const addToCart = useCallback((item: Omit<CartItem, 'quantity'>, qty = 1) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === item.productId);
      if (existing) {
        return prev.map((c) =>
          c.productId === item.productId
            ? { ...c, quantity: Math.min(item.stockQuantity, c.quantity + qty) }
            : c
        );
      }
      return [...prev, { ...item, quantity: Math.min(item.stockQuantity, Math.max(1, qty)) }];
    });
    setCartOpen(true);
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, quantity: Math.min(c.stockQuantity, qty) } : c))
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <AppContext.Provider
      value={{
        lang,
        setLang,
        user,
        cooperative,
        unreadNotifications,
        authLoading,
        refreshSession,
        logout,
        currentPath,
        navigate,
        cart,
        cartOpen,
        setCartOpen,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        cartCount,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
