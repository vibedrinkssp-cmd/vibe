import { useState, lazy, Suspense, useEffect } from 'react';
import { 
  Shield, Lock, Eye, EyeOff, LogOut, Loader2,
  ShoppingBag, Grid3X3, Image, Wine, Sparkles,
  BarChart3, ClipboardList, Settings, FileDown, Database, Briefcase,
  BookOpen, Warehouse, Package, KeyRound, Ticket, MonitorPlay, QrCode, BadgePercent, Users
} from 'lucide-react';
import { StoreStatusToggle } from '@/components/StoreStatusToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { useAuth } from '@/lib/auth';
import {
  clearManagerSession,
  getManagerSessionToken,
  isManagerSessionValid,
  refreshManagerSession,
  setManagerSessionToken as persistManagerSessionToken,
} from '@/lib/admin-session';


// Catalog tabs (from admin)
const ProductsTab = lazy(() => import('./admin/tabs/ProductsTab').then(m => ({ default: m.ProductsTab })));
const CategoriesTab = lazy(() => import('./admin/tabs/CategoriesTab').then(m => ({ default: m.CategoriesTab })));
const BannersTab = lazy(() => import('./admin/tabs/BannersTab').then(m => ({ default: m.BannersTab })));
const PagercomTab = lazy(() => import('./admin/tabs/PagercomTab').then(m => ({ default: m.PagercomTab })));
const SpecialDrinksConfigTab = lazy(() => import('./admin/tabs/SpecialDrinksConfigTab').then(m => ({ default: m.SpecialDrinksConfigTab })));
const SpecialDrinksRecipesTab = lazy(() => import('./admin/tabs/SpecialDrinksRecipesTab').then(m => ({ default: m.SpecialDrinksRecipesTab })));
const BottlesTab = lazy(() => import('./admin/tabs/BottlesTab').then(m => ({ default: m.BottlesTab })));
const PacksTab = lazy(() => import('./admin/tabs/PacksTab').then(m => ({ default: m.PacksTab })));
const QrCodeTab = lazy(() => import('./admin/tabs/QrCodeTab').then(m => ({ default: m.QrCodeTab })));

// Admin-migrated tabs
const DailyReportTab = lazy(() => import('./admin/tabs/DailyReportTab').then(m => ({ default: m.DailyReportTab })));
const ReportsTab = lazy(() => import('./admin/tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./admin/tabs/SettingsTab').then(m => ({ default: m.SettingsTab })));
const BackupDataTab = lazy(() => import('./admin/tabs/BackupDataTab').then(m => ({ default: m.BackupDataTab })));
const ImportProductsTab = lazy(() => import('./admin/tabs/ImportProductsTab'));
const CadernetaTab = lazy(() => import('./admin/tabs/CadernetaTab').then(m => ({ default: m.CadernetaTab })));
const StockTab = lazy(() => import('./admin/tabs/StockTab').then(m => ({ default: m.StockTab })));
const CredentialsTab = lazy(() => import('./admin/tabs/CredentialsTab').then(m => ({ default: m.CredentialsTab })));
const PosCouponsTab = lazy(() => import('./admin/tabs/PosCouponsTab').then(m => ({ default: m.PosCouponsTab })));
const WeeklyPromotionsTab = lazy(() => import('./admin/tabs/WeeklyPromotionsTab').then(m => ({ default: m.WeeklyPromotionsTab })));
const TimeClockTab = lazy(() => import('./admin/tabs/TimeClockTab').then(m => ({ default: m.TimeClockTab })));

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

const tabs = [
  // Catalog
  { id: 'produtos', label: 'Produtos', icon: ShoppingBag },
  { id: 'categorias', label: 'Categorias', icon: Grid3X3 },
  { id: 'banners', label: 'Banners', icon: Image },
  { id: 'pagercom', label: 'PAGERCOM', icon: MonitorPlay },
  { id: 'drink-types', label: 'Monte Drink', icon: Wine },
  { id: 'drinks-especiais', label: 'Drinks Especiais', icon: Sparkles },
  { id: 'garrafas', label: 'Garrafas', icon: Wine },
  { id: 'macos', label: 'Maços', icon: Package },
  // Management
  { id: 'estoque', label: 'Estoque', icon: Warehouse },
  { id: 'funcionarios', label: 'Funcionários', icon: Users },
  { id: 'caderneta', label: 'Caderneta', icon: BookOpen },
  { id: 'cupons', label: 'Cupons', icon: Ticket },
  { id: 'promocoes', label: 'Promoções', icon: BadgePercent },
  { id: 'qrcode', label: 'QR Code', icon: QrCode },
  // Admin tools
  { id: 'relatorio-dia', label: 'Relatório Diário', icon: ClipboardList },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'import', label: 'Importar CSV', icon: FileDown },
  { id: 'backup', label: 'BKP e Dados', icon: Database },
  { id: 'credenciais', label: 'Credenciais', icon: KeyRound },
];

export default function Manager() {
  const { login: authLogin, logout: authLogout } = useAuth();
  const [authenticated, setAuthenticated] = useState(() => isManagerSessionValid());
  const [managerSessionToken, setManagerSessionToken] = useState<string | null>(() => getManagerSessionToken());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [supabaseAuthMissing, setSupabaseAuthMissing] = useState(false);
  const [activeTab, setActiveTab] = useState('produtos');
  const { toast } = useToast();

  // Restore Supabase Auth session on mount/refresh to ensure RLS works
  useEffect(() => {
    if (!authenticated) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;

    // Give Supabase client time to restore from localStorage automatically
    supabase.auth.getSession().then((result) => {
      if (cancelled) return;
      const session = result?.data?.session ?? null;
      if (session?.user) {
        console.log('[Manager] Supabase Auth session restored');
        setSupabaseAuthMissing(false);
      } else {
        console.warn('[Manager] No Supabase Auth session — some operations may require re-login');
        setSupabaseAuthMissing(true);
      }
      setAuthReady(true);
    }).catch(() => {
      if (!cancelled) {
        setSupabaseAuthMissing(true);
        setAuthReady(true);
      }
    });

    return () => { cancelled = true; };
  }, [authenticated]);

  // Extend session on any user activity (tab changes, clicks, key presses)
  useEffect(() => {
    if (!authenticated) return;
    refreshManagerSession();

    const renewSession = () => {
      if (isManagerSessionValid()) {
        refreshManagerSession();
      }
    };

    window.addEventListener('click', renewSession);
    window.addEventListener('keydown', renewSession);
    window.addEventListener('touchstart', renewSession);
    return () => {
      window.removeEventListener('click', renewSession);
      window.removeEventListener('keydown', renewSession);
      window.removeEventListener('touchstart', renewSession);
    };
  }, [activeTab, authenticated]);

  // Check session validity periodically
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      if (!isManagerSessionValid()) {
        clearManagerSession();
        setManagerSessionToken(null);
        setAuthenticated(false);
        toast({ title: 'Sessão expirada', description: 'Faça login novamente.', variant: 'destructive' });
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [authenticated, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-manager-password', {
        body: { password }
      });
      
      if (fnError) {
        setError('Erro ao verificar senha');
        return;
      }
      
      if (data?.success) {
        // Establish Supabase Auth session so RLS works for admin tabs
        if (data.accessToken && data.refreshToken) {
          await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          });
        }

        // Set auth context so tabs can access sessionToken and role
        if (data.user && data.sessionToken) {
          authLogin(
            { id: data.user.id, name: data.user.name, whatsapp: data.user.whatsapp, role: 'admin' },
            'admin',
            data.sessionToken
          );
        }

        setAuthenticated(true);
        refreshManagerSession();
        if (data.sessionToken) {
          setManagerSessionToken(data.sessionToken);
          persistManagerSessionToken(data.sessionToken);
        }
      } else {
        setError(data?.error || 'Senha incorreta');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-primary/20">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Briefcase className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Área Gerencial</CardTitle>
            <CardDescription>Acesso restrito — senha numérica de 8 dígitos</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="mgr-pass">Senha de acesso</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="mgr-pass"
                    type={showPassword ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={8}
                    pattern="\d{8}"
                    value={password}
                    onChange={e => { 
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8);
                      setPassword(val); 
                      setError(''); 
                    }}
                    placeholder="••••••••"
                    className="pl-10 pr-10 tracking-widest text-center text-lg"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <p className="text-xs text-muted-foreground text-center">{password.length}/8 dígitos</p>
              </div>
              <Button type="submit" className="w-full" disabled={password.length !== 8 || loading}>
                {loading ? 'Verificando...' : 'Acessar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while auth session is being restored
  if (authenticated && !authReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Restaurando sessão...</p>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'produtos': return <ProductsTab />;
      case 'categorias': return <CategoriesTab />;
      case 'banners': return <BannersTab />;
      case 'pagercom': return <PagercomTab />;
      case 'drink-types': return <SpecialDrinksConfigTab sessionTokenOverride={managerSessionToken} />;
      case 'drinks-especiais': return <SpecialDrinksRecipesTab sessionTokenOverride={managerSessionToken} />;
      case 'garrafas': return <BottlesTab />;
      case 'macos': return <PacksTab />;
      case 'estoque': return <StockTab />;
      case 'funcionarios': return <TimeClockTab />;
      case 'caderneta': return <CadernetaTab sessionTokenOverride={managerSessionToken} />;
      case 'cupons': return <PosCouponsTab />;
      case 'promocoes': return <WeeklyPromotionsTab />;
      case 'qrcode': return <QrCodeTab />;
      case 'relatorio-dia': return <DailyReportTab />;
      case 'reports': return <ReportsTab />;
      case 'settings': return <SettingsTab />;
      case 'import': return <ImportProductsTab />;
      case 'backup': return <BackupDataTab />;
      case 'credenciais': return <CredentialsTab />;
      default: return <ProductsTab />;
    }
  };

  return (
    <div className="h-screen-safe bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-[#0A0A0A] border-b border-[#D4AF37]/30 py-3 px-3 md:px-6 flex items-center justify-between gap-2 sticky top-0 z-50 flex-shrink-0 w-full max-w-full overflow-hidden">
        <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
          <Briefcase className="h-5 w-5 md:h-7 md:w-7 text-white shrink-0" />
          <h1 className="font-serif text-base md:text-2xl text-white truncate">Painel Gerencial</h1>
          <Badge className="hidden sm:inline-flex bg-primary-foreground/20 text-white border-primary-foreground/30 text-xs shrink-0">Confidencial</Badge>
        </div>
        <div className="flex items-center gap-1 md:gap-2 shrink-0">
          <StoreStatusToggle />
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-primary-foreground/10 gap-1.5 px-2"
            onClick={() => {
              clearManagerSession();
              authLogout();
              setAuthenticated(false);
              setManagerSessionToken(null);
              setPassword('');
            }}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar Navigation (desktop) */}
        <aside className="hidden md:flex md:flex-col w-56 flex-shrink-0 border-r border-primary/20 bg-card/50 overflow-y-auto">
          <div className="flex flex-col p-2 gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={`flex items-center justify-start gap-2 whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </Button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tab Navigation (mobile) */}
          <div className="md:hidden border-b border-primary/20 bg-card/50 flex-shrink-0">
            <ScrollArea className="w-full">
              <div className="flex p-2 gap-2 min-w-max">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Button
                      key={tab.id}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className={`flex items-center gap-2 whitespace-nowrap border min-w-fit font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </Button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Tab Content */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full">
            <div className="p-3 md:p-6 max-w-7xl mx-auto pb-20 w-full min-w-0 overflow-x-hidden">
              {supabaseAuthMissing && (
                <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-3">
                  <Shield className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Sessão de banco expirada</p>
                    <p className="text-xs opacity-90 mt-0.5">
                      Algumas operações que dependem de RLS podem falhar silenciosamente. Faça logout e entre novamente para restaurar permissões.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/20"
                    onClick={() => {
                      clearManagerSession();
                      authLogout();
                      setAuthenticated(false);
                      setManagerSessionToken(null);
                    }}
                  >
                    Reautenticar
                  </Button>
                </div>
              )}
              <Suspense fallback={<TabSkeleton />}>
                {renderTabContent()}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
