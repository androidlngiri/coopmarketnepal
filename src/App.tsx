import { Toaster } from 'sonner';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { CooperativesPage } from './pages/CooperativesPage';
import { StorefrontPage } from './pages/StorefrontPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { RegisterCooperativePage } from './pages/RegisterCooperativePage';
import { CheckoutPage } from './pages/CheckoutPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AuthPage } from './pages/AuthPage';
import { BuyerAccountPage } from './pages/BuyerAccountPage';
import { CooperativeDashboardPage } from './pages/CooperativeDashboardPage';
import { SuperAdminDashboardPage } from './pages/SuperAdminDashboardPage';
import { LegalPage } from './pages/LegalPage';

function RouterView() {
  const { currentPath } = useApp();
  const pathname = currentPath.split('?')[0];

  if (pathname === '/' || pathname === '') return <HomePage />;
  if (pathname === '/marketplace') return <MarketplacePage />;
  if (pathname === '/cooperatives') return <CooperativesPage />;
  if (pathname.startsWith('/store/')) {
    const slug = decodeURIComponent(pathname.replace('/store/', '').split('/')[0]);
    return <StorefrontPage slug={slug} />;
  }
  if (pathname.startsWith('/product/')) {
    const slug = decodeURIComponent(pathname.replace('/product/', '').split('/')[0]);
    return <ProductDetailPage slug={slug} />;
  }
  if (pathname === '/register-cooperative') return <RegisterCooperativePage />;
  if (pathname === '/checkout') return <CheckoutPage />;
  if (pathname === '/track-order') return <TrackOrderPage />;
  if (pathname === '/login') return <AuthPage />;
  if (pathname === '/account') return <BuyerAccountPage />;
  if (pathname === '/cooperative') return <CooperativeDashboardPage />;
  if (pathname === '/super-admin') return <SuperAdminDashboardPage />;
  if (pathname === '/about') return <LegalPage doc="about" />;
  if (pathname === '/faq') return <LegalPage doc="faq" />;
  if (pathname === '/terms') return <LegalPage doc="terms" />;
  if (pathname === '/privacy') return <LegalPage doc="privacy" />;

  return <HomePage />;
}

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#0F172A]">
        <Header />
        <main className="flex-1">
          <RouterView />
        </main>
        <Footer />
        <CartDrawer />
        <Toaster position="bottom-right" richColors />
      </div>
    </AppProvider>
  );
}
