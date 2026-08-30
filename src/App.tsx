import { Suspense, lazy, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { CartProvider } from "@/lib/cart";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SplashScreen } from "@/components/SplashScreen";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ensureNotificationSoundUnlockListeners } from "@/lib/notification-sound-engine";
import { useVisitorTracking } from "@/hooks/use-visitor-tracking";
import {
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
} from "@/lib/safe-browser-storage";

const Home = lazy(() => import("@/pages/Home"));
const Login = lazy(() => import("@/pages/Login"));

const Checkout = lazy(() => import("@/pages/Checkout"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderTracking = lazy(() => import("@/pages/OrderTracking"));
const Kitchen = lazy(() => import("@/pages/Kitchen"));
const Motoboy = lazy(() => import("@/pages/Motoboy"));
const PDV = lazy(() => import("@/pages/PDV"));
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const Profile = lazy(() => import("@/pages/Profile"));
const Financeiro = lazy(() => import("@/pages/Financeiro"));
const TotemPanel = lazy(() => import("@/pages/TotemPanel"));
const TotemPanelLinux = lazy(() => import("@/pages/TotemPanelLinux"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Arckane = lazy(() => import("@/pages/Arckane"));
const Manager = lazy(() => import("@/pages/Manager"));
const Log = lazy(() => import("@/pages/Log"));
const MotoboyDelivery = lazy(() => import("@/pages/MotoboyDelivery"));
const Pager = lazy(() => import("@/pages/Pager"));
const Ponto = lazy(() => import("@/pages/Ponto"));

const SPLASH_SESSION_KEY = '__vm_splash_shown';

const shouldShowSplashOnLoad = () => {
  if (typeof window === "undefined") return false;
  if (safeSessionStorageGetItem(SPLASH_SESSION_KEY)) return false;
  if (window.location.pathname !== '/' && window.location.pathname !== '') return false;
  // Staff pages never show splash
  const staffPaths = ['/admin', '/pdv', '/cozinha', '/log', '/motoboy', '/manager', '/totempanel', '/totempanel-linux', '/financeiro', '/pager', '/ponto'];
  if (staffPaths.some(p => window.location.pathname.startsWith(p))) return false;
  return true;
};

function AppRoutes() {
  const location = useLocation();
  const staffPaths = ['/admin', '/pdv', '/cozinha', '/log', '/motoboy', '/manager', '/financeiro', '/pager', '/ponto'];
  const isStaffPath = staffPaths.some((path) => location.pathname.startsWith(path));
  useVisitorTracking({ enabled: !isStaffPath });

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/pedido/:orderId" element={<OrderTracking />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/cozinha" element={<Kitchen />} />
        <Route path="/motoboy" element={<Motoboy />} />
        <Route path="/motoboy/entrega/:orderId" element={<MotoboyDelivery />} />
        <Route path="/pdv" element={<PDV />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/totempanel" element={<TotemPanel />} />
        <Route path="/totempanel-linux" element={<TotemPanelLinux />} />
        <Route path="/arckane" element={<Arckane />} />
        <Route path="/manager" element={<Manager />} />
        <Route path="/log" element={<Log />} />
        <Route path="/pager" element={<Pager />} />
        <Route path="/ponto" element={<Ponto />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function RouteProviderShell() {
  const location = useLocation();
  const path = location.pathname;
  const needsCartProvider = path === '/' || path.startsWith('/checkout') || path.startsWith('/pedidos') || path.startsWith('/pedido/') || path.startsWith('/perfil');
  const routes = <AppRoutes />;

  return needsCartProvider ? <CartProvider>{routes}</CartProvider> : routes;
}

function App() {
  const [showSplash, setShowSplash] = useState(() => shouldShowSplashOnLoad());

  // Sound auto-unlock — installs global listeners on first user gesture
  useEffect(() => {
    ensureNotificationSoundUnlockListeners();
  }, []);

  // Safety: force splash off after 6s max to prevent permanent black screen
  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => {
      safeSessionStorageSetItem(SPLASH_SESSION_KEY, '1');
      setShowSplash(false);
    }, 6000);
    return () => clearTimeout(timer);
  }, [showSplash]);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              {showSplash && (
                <SplashScreen
                  onComplete={() => {
                    safeSessionStorageSetItem(SPLASH_SESSION_KEY, '1');
                    setShowSplash(false);
                  }}
                  duration={3500}
                />
              )}
              {!showSplash && (
                <BrowserRouter>
                  <RouteProviderShell />
                </BrowserRouter>
              )}
              <Toaster />
              <SonnerToaster position="top-center" richColors duration={4000} />
              <PWAInstallPrompt showAfterSplash={!showSplash} />
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
