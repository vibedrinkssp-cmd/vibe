import { Fragment, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
// notification-sound-engine local agent removed
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { 
  Package, 
  Truck, 
  HelpCircle,
  Users, 
   
  Bike, 
  LogOut,
  Wifi,
  WifiOff,
  Warehouse,
  Receipt,
  Calculator,
  Wine,
  ScanLine,
  Wallet,
 ArrowLeftRight,
 ArrowUpFromLine,
  
  Cigarette,
  MapPin,
  ClipboardCheck,
  CalendarDays,
  Fingerprint,
  ShoppingBag,
  Grid3X3,
  Image as ImageIcon,
  MonitorPlay,
  Sparkles,
  BookOpen,
  Ticket,
  BadgePercent,
  QrCode,
  ClipboardList,
  BarChart3,
  Settings,
  FileDown,
  Database,
  KeyRound,
} from 'lucide-react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useAdminRealtime } from '@/hooks/use-realtime-sync';
import { useSupabaseHealth } from '@/hooks/use-supabase-health';
import { useNotificationSound } from '@/hooks/use-notification-sound';
import { useOrderAlert } from '@/hooks/use-order-alert';
import { useSoundTestListener } from '@/hooks/use-sound-test-listener';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { useToast } from '@/hooks/use-toast';
import { playCashRegisterSound, primeCashRegisterSound } from '@/lib/cash-register-sound';

import { HeaderCashMonitor } from '@/components/admin/HeaderCashMonitor';
import { HeaderSoundAlert } from '@/components/admin/HeaderSoundAlert';
import { HeaderAlertStop } from '@/components/admin/HeaderAlertStop';
import { VisitorMonitor } from '@/components/VisitorMonitor';
import { SoundUnlockBanner } from '@/components/SoundUnlockBanner';
import { AdminAIAssistant } from '@/components/admin/AdminAIAssistant';
import { AdminTutorialModal } from '@/components/admin/AdminTutorialModal';

import { StoreStatusToggle } from '@/components/StoreStatusToggle';
import { SangriasTab } from './tabs/SangriasTab';

// Lazy-load all tabs — each becomes a separate chunk for reliable loading
const OrdersTab = lazy(() => import('./tabs/OrdersTab').then(m => ({ default: m.OrdersTab })));
const DeliveryTab = lazy(() => import('./tabs/DeliveryTab').then(m => ({ default: m.DeliveryTab })));
const CategoriesTab = lazy(() => import('./tabs/CategoriesTab').then(m => ({ default: m.CategoriesTab })));
const MotoboysTab = lazy(() => import('./tabs/MotoboysTab').then(m => ({ default: m.MotoboysTab })));
const StockTab = lazy(() => import('./tabs/StockTab').then(m => ({ default: m.StockTab })));
const CashClosureTab = lazy(() => import('./tabs/CashClosureTab').then(m => ({ default: m.CashClosureTab })));
const TrackingTab = lazy(() => import('./tabs/TrackingTab').then(m => ({ default: m.TrackingTab })));
const BottlesTab = lazy(() => import('./tabs/BottlesTab').then(m => ({ default: m.BottlesTab })));
const PacksTab = lazy(() => import('./tabs/PacksTab').then(m => ({ default: m.PacksTab })));
const BarcodesTab = lazy(() => import('./tabs/BarcodesTab').then(m => ({ default: m.BarcodesTab })));
const CaixaTab = lazy(() => import('./tabs/CaixaTab').then(m => ({ default: m.CaixaTab })));
const SaqDepTab = lazy(() => import('./tabs/SaqDepTab').then(m => ({ default: m.SaqDepTab })));
// CouponsTab removido — cupons agora são gerenciados direto no cadastro do cliente
// CadernetaTab removed — only available in Manager
const ClientsTab = lazy(() => import('./tabs/ClientsTab').then(m => ({ default: m.ClientsTab })));

const SyncInTab = lazy(() => import('./tabs/SyncInTab').then(m => ({ default: m.SyncInTab })));
const ScheduleTab = lazy(() => import('./tabs/ScheduleTab').then(m => ({ default: m.ScheduleTab })));

const MotoboyClosureTab = lazy(() => import('./tabs/MotoboyClosureTab').then(m => ({ default: m.MotoboyClosureTab })));
const TimeClockTab = lazy(() => import('./tabs/TimeClockTab').then(m => ({ default: m.TimeClockTab })));
const ProductsTab = lazy(() => import('./tabs/ProductsTab').then(m => ({ default: m.ProductsTab })));
const BannersTab = lazy(() => import('./tabs/BannersTab').then(m => ({ default: m.BannersTab })));
const PagercomTab = lazy(() => import('./tabs/PagercomTab').then(m => ({ default: m.PagercomTab })));
const SpecialDrinksConfigTab = lazy(() => import('./tabs/SpecialDrinksConfigTab').then(m => ({ default: m.SpecialDrinksConfigTab })));
const SpecialDrinksRecipesTab = lazy(() => import('./tabs/SpecialDrinksRecipesTab').then(m => ({ default: m.SpecialDrinksRecipesTab })));
const CadernetaTab = lazy(() => import('./tabs/CadernetaTab').then(m => ({ default: m.CadernetaTab })));
const PosCouponsTab = lazy(() => import('./tabs/PosCouponsTab').then(m => ({ default: m.PosCouponsTab })));
const WeeklyPromotionsTab = lazy(() => import('./tabs/WeeklyPromotionsTab').then(m => ({ default: m.WeeklyPromotionsTab })));
const QrCodeTab = lazy(() => import('./tabs/QrCodeTab').then(m => ({ default: m.QrCodeTab })));
const DailyReportTab = lazy(() => import('./tabs/DailyReportTab').then(m => ({ default: m.DailyReportTab })));
const ReportsTab = lazy(() => import('./tabs/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./tabs/SettingsTab').then(m => ({ default: m.SettingsTab })));
const ImportProductsTab = lazy(() => import('./tabs/ImportProductsTab'));
const BackupDataTab = lazy(() => import('./tabs/BackupDataTab').then(m => ({ default: m.BackupDataTab })));
const CredentialsTab = lazy(() => import('./tabs/CredentialsTab').then(m => ({ default: m.CredentialsTab })));

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

const tabs = [
  // Dia a dia
  { id: 'pedidos', label: 'Pedidos', icon: Package, group: 'Dia a dia' },
  { id: 'delivery', label: 'Delivery', icon: Truck, group: 'Dia a dia' },
  { id: 'tracking', label: 'Tracking', icon: MapPin, group: 'Dia a dia' },
  { id: 'caixa', label: 'Caixa', icon: Wallet, group: 'Dia a dia' },
  { id: 'garrafas', label: 'Garrafas', icon: Wine, alwaysShowLabel: true, group: 'Dia a dia' },
  { id: 'estoque', label: 'Estoque', icon: Warehouse, group: 'Dia a dia' },
  // Dinheiro
  { id: 'saqdep', label: 'Saques', icon: ArrowUpFromLine, group: 'Dinheiro' },
  { id: 'sangrias', label: 'Sangrias', icon: Receipt, group: 'Dinheiro' },
  { id: 'fechamento', label: 'Fechamento', icon: Calculator, group: 'Dinheiro' },
  { id: 'fechamento-boys', label: 'Fech. Boys', icon: ClipboardCheck, group: 'Dinheiro' },
  { id: 'caderneta', label: 'Caderneta', icon: BookOpen, group: 'Dinheiro' },
  { id: 'relatorio-dia', label: 'Relatório Diário', icon: ClipboardList, group: 'Dinheiro' },
  // Catálogo
  { id: 'produtos', label: 'Produtos', icon: ShoppingBag, group: 'Catálogo' },
  { id: 'categorias', label: 'Categorias', icon: Grid3X3, group: 'Catálogo' },
  { id: 'banners', label: 'Banners', icon: ImageIcon, group: 'Catálogo' },
  { id: 'promocoes', label: 'Promoções', icon: BadgePercent, group: 'Catálogo' },
  { id: 'cupons', label: 'Cupons', icon: Ticket, group: 'Catálogo' },
  { id: 'drink-types', label: 'Monte Drink', icon: Wine, group: 'Catálogo' },
  { id: 'drinks-especiais', label: 'Drinks Especiais', icon: Sparkles, group: 'Catálogo' },
  { id: 'pagercom', label: 'PAGERCOM', icon: MonitorPlay, group: 'Catálogo' },
  { id: 'qrcode', label: 'QR Code', icon: QrCode, group: 'Catálogo' },
  // Cadastros
  { id: 'clientes', label: 'Clientes', icon: Users, group: 'Cadastros' },
  { id: 'motoboys', label: 'Motoboys', icon: Bike, group: 'Cadastros' },
  { id: 'macos', label: 'Maços', icon: Cigarette, alwaysShowLabel: true, group: 'Cadastros' },
  { id: 'barcodes', label: 'Códigos de Barras', icon: ScanLine, group: 'Cadastros' },
  // Equipe
  { id: 'sync-in', label: 'SYNC IN', icon: ClipboardCheck, alwaysShowLabel: true, group: 'Equipe' },
  { id: 'escala', label: 'ESCALA', icon: CalendarDays, alwaysShowLabel: true, group: 'Equipe' },
  { id: 'ponto', label: 'PONTO', icon: Fingerprint, alwaysShowLabel: true, group: 'Equipe' },
  // Sistema
  { id: 'reports', label: 'Relatórios', icon: BarChart3, group: 'Sistema' },
  { id: 'settings', label: 'Configurações', icon: Settings, group: 'Sistema' },
  { id: 'import', label: 'Importar CSV', icon: FileDown, group: 'Sistema' },
  { id: 'backup', label: 'BKP e Dados', icon: Database, group: 'Sistema' },
  { id: 'credenciais', label: 'Credenciais', icon: KeyRound, group: 'Sistema' },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { role, logout, isHydrated } = useAuth();
  const [activeTab, setActiveTab] = useState('pedidos');
  const [isSSEConnected, setIsSSEConnected] = useState(false);
  const { isOnline: isCloudOnline } = useSupabaseHealth({
    enabled: isHydrated && role === 'admin',
    externalAlive: isSSEConnected,
  });
  const [showVisitors, setShowVisitors] = useState(() => localStorage.getItem('admin_showVisitors') === 'true');
  const [showTutorial, setShowTutorial] = useState(false);
  const { playOnce } = useNotificationSound({ screen: 'admin' });
  const { alertOrder, ackOrder, ackAll, syncPendingOrders, isAlertActive } = useOrderAlert('admin');
  const { toast } = useToast();
  const { notifyNewOrder, notifyOrderStatusChange } = usePushNotifications({ playSound: false });
  const pdvCashSoundPlayedRef = useRef<Set<string>>(new Set());

  const isAuthorized = isHydrated && role === 'admin';

  useEffect(() => {
    if (!isAuthorized) return;
    const unlock = () => primeCashRegisterSound();
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', unlock, { capture: true } as EventListenerOptions);
    };
  }, [isAuthorized]);

  // Badge: count of empty packs awaiting renewal
  const { data: openPacks } = useQuery({
    queryKey: ['open-packs'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_packs');
      if (error) throw error;
      return (data ?? []) as Array<{ is_empty?: boolean }>;
    },
    enabled: isAuthorized,
    refetchInterval: 30000,
    staleTime: 15000,
  });
  const emptyPacksCount = (openPacks ?? []).filter((p) => p.is_empty).length;

  // Reconciliação por polling: usa RPC Security Definer porque o login interno
  // é customizado; consulta direta em orders pode ficar bloqueada por RLS e
  // perder pedidos feitos no painel do cliente. Admin SÓ alerta DELIVERY.
  // Sem janela de tempo: se o painel abriu e existe delivery pendente/aceito,
  // o som precisa tocar até alguém tratar o pedido naquela tela.
  const { data: alertPollOrders } = useQuery({
    queryKey: ['admin-alert-poll'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_orders_complete');
      if (error) throw error; // mantém os dados anteriores em vez de zerar a fila de alertas
      return ((data || []) as Array<{ id: string; status: string; order_type: string; accepted_at: string | null; created_at: string }>)
        .filter((o) => o.order_type === 'delivery' && (o.status === 'pending' || o.status === 'accepted'))
        .slice(0, 50);
    },
    enabled: isAuthorized,
    refetchInterval: 5000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const pendingOrdersCount = alertPollOrders?.length ?? 0;

  useEffect(() => {
    if (!isAuthorized || !alertPollOrders) return;
    const actionableIds = alertPollOrders
      .filter((o) => o.order_type === 'delivery' && (o.status === 'pending' || o.status === 'accepted'))
      .map((o) => o.id);
    syncPendingOrders(actionableIds);
  }, [isAuthorized, alertPollOrders, syncPendingOrders]);

  useSoundTestListener({
    panelId: 'admin',
    enabled: isAuthorized,
    onTestSignal: (soundType) => {
      playOnce(soundType);
      toast({ title: `🔊 Teste de som recebido (${soundType})` });
    },
  });

  useEffect(() => { localStorage.setItem('admin_showVisitors', String(showVisitors)); }, [showVisitors]);

  useAdminRealtime({
    enabled: isAuthorized,
    onConnected: () => setIsSSEConnected(true),
    onDisconnected: () => setIsSSEConnected(false),
    onEvent: (event) => {
      if (event.table === 'orders') {
        if (event.event === 'INSERT') {
          const orderId = event.payload?.id;
          const orderType = event.payload?.order_type;
          const notes = event.payload?.notes || '';
          const isIfood = notes.toLowerCase().includes('ifood') || notes.toLowerCase().includes('plataforma:');
          const isPdv = orderType === 'counter';
          const isDelivery = orderType === 'delivery';

          // Loop no admin SÓ para delivery. PDV/Balcão toca apenas 1x o som de caixa registradora.
          if (orderId && isDelivery) alertOrder(orderId);
          if (orderId && isPdv) {
            ackOrder(orderId);
            if (!pdvCashSoundPlayedRef.current.has(orderId)) {
              pdvCashSoundPlayedRef.current.add(orderId);
              void playCashRegisterSound(0.7);
            }
          }

          if (isIfood) {
            toast({ title: '🟥 Pedido iFood recebido!' });
          } else if (isPdv) {
            toast({ title: '🏪 Pedido PDV registrado!' });
          } else if (isDelivery) {
            toast({ title: '🛵 Novo pedido Delivery!' });
          } else {
            toast({ title: '🔔 Novo pedido recebido!' });
          }
          // local agent removed
          notifyNewOrder(event.payload?.id || '', event.payload?.customer_name);
        } else if (event.event === 'UPDATE') {
          const status = event.payload?.status;
          const orderId = event.payload?.id;
          const orderType = event.payload?.order_type;
          const shouldRemainInAdminQueue = orderType === 'delivery' && (status === 'pending' || status === 'accepted');
          if (orderId && !shouldRemainInAdminQueue) ackOrder(orderId);

          if (status === 'cancelled' && orderId) {
            ackOrder(orderId);
            playOnce('cancelled');
            toast({ title: '❌ Pedido cancelado!', variant: 'destructive' as const });
          }
          notifyOrderStatusChange(event.payload?.id || '', event.payload?.status || '');
        }
      }
    },
  });

  useEffect(() => {
    if (isHydrated && role !== 'admin') {
      navigate('/');
    }
  }, [isHydrated, role, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!isHydrated || role !== 'admin') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'pedidos': return <OrdersTab />;
      case 'delivery': return <DeliveryTab />;
      case 'tracking': return <TrackingTab />;
      case 'caixa': return <CaixaTab />;
      case 'saqdep': return <SaqDepTab />;
      case 'garrafas': return <BottlesTab />;
      case 'macos': return <PacksTab />;
      case 'sangrias': return <SangriasTab />;
      case 'fechamento': return <CashClosureTab />;
      case 'fechamento-boys': return <MotoboyClosureTab />;
      case 'estoque': return <StockTab />;
      case 'barcodes': return <BarcodesTab />;
      // caderneta removed from admin
      case 'clientes': return <ClientsTab />;
      
      case 'motoboys': return <MotoboysTab />;
      
      case 'sync-in': return <SyncInTab />;
      case 'escala': return <ScheduleTab />;
      case 'ponto': return <TimeClockTab />;
      case 'caderneta': return <CadernetaTab />;
      case 'relatorio-dia': return <DailyReportTab />;
      case 'produtos': return <ProductsTab />;
      case 'categorias': return <CategoriesTab />;
      case 'banners': return <BannersTab />;
      case 'promocoes': return <WeeklyPromotionsTab />;
      case 'cupons': return <PosCouponsTab />;
      case 'drink-types': return <SpecialDrinksConfigTab />;
      case 'drinks-especiais': return <SpecialDrinksRecipesTab />;
      case 'pagercom': return <PagercomTab />;
      case 'qrcode': return <QrCodeTab />;
      case 'reports': return <ReportsTab />;
      case 'settings': return <SettingsTab />;
      case 'import': return <ImportProductsTab />;
      case 'backup': return <BackupDataTab />;
      case 'credenciais': return <CredentialsTab />;
      
      default: return <OrdersTab />;
    }
  };

  return (
    <div className="h-screen-safe bg-background flex flex-col overflow-hidden relative">
      <SoundUnlockBanner />
      {/* Header */}
      <header className="bg-[#0A0A0A] border-b border-[#D4AF37]/30 py-3 px-3 md:px-6 flex flex-wrap items-center justify-between gap-2 sticky top-0 z-50 flex-shrink-0 w-full overflow-hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="h-5 w-5 md:h-8 md:w-8 text-white flex-shrink-0" />
          <h1 className="font-serif text-base md:text-2xl text-white truncate">Painel Admin</h1>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 flex-wrap max-w-full overflow-hidden">
          <HeaderAlertStop isAlertActive={isAlertActive} onStop={ackAll} />
          <StoreStatusToggle />
          <HeaderSoundAlert />
          <Button
            size="sm"
            variant={activeTab === 'pedidos' ? 'default' : 'outline'}
            className={`gap-1.5 ${activeTab !== 'pedidos' ? 'border-primary-foreground/40 text-white hover:bg-primary-foreground/10' : ''}`}
            onClick={() => { ackAll(); setActiveTab('pedidos'); }}
            data-testid="button-ver-pedidos"
          >
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Ver Pedidos</span>
            {pendingOrdersCount > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-bold">{pendingOrdersCount}</Badge>
            )}
          </Button>
          <HeaderCashMonitor />
          <Button
            variant={showVisitors ? "default" : "outline"}
            size="sm"
            className={`gap-1.5 ${!showVisitors ? 'border-primary-foreground/40 text-white hover:bg-primary-foreground/10' : ''}`}
            onClick={() => setShowVisitors((v: boolean) => !v)}
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Visitantes</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 border-primary-foreground/40 text-white hover:bg-primary-foreground/10"
            onClick={() => setShowTutorial(true)}
          >
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Ajuda</span>
          </Button>
          <AdminAIAssistant />
          <Badge 
            className={isCloudOnline
              ? "bg-green-500 text-white border-green-600" 
              : "bg-red-500/20 text-red-200 border-red-500/30"
            }
            data-testid="badge-connection-status"
            title={isCloudOnline
              ? (isSSEConnected ? 'Realtime + REST OK' : 'REST OK (realtime reconectando)')
              : 'Sem conexão com Lovable Cloud'}
          >
            {isCloudOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            <span className="hidden sm:inline">{isCloudOnline ? 'Ao Vivo' : 'Offline'}</span>
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-primary-foreground/10"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Overlay panels */}
      {showVisitors && (
        <>
          <div 
            className="fixed inset-0 z-[55] bg-black/30" 
            onClick={() => { setShowVisitors(false); }} 
          />
          <div className="fixed left-0 right-0 top-[72px] z-[60] p-3 bg-background border-b border-border shadow-2xl max-h-[70vh] overflow-y-auto">
            <div className="max-w-7xl mx-auto">
              <VisitorMonitor />
            </div>
          </div>
        </>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar Navigation (desktop) */}
        <aside className="hidden md:flex md:flex-col w-56 flex-shrink-0 border-r border-primary/20 bg-card/50 overflow-y-auto">
          <div className="flex flex-col p-2 gap-1">
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const showBadge = tab.id === 'macos' && emptyPacksCount > 0;
              const startsGroup = tab.group !== tabs[index - 1]?.group;
              return (
                <Fragment key={tab.id}>
                {startsGroup && (
                  <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 first:pt-0">
                    {tab.group}
                  </p>
                )}
                <Button
                  variant={isActive ? "default" : "ghost"}
                  size="sm"
                  className={`flex items-center justify-start gap-2 whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                  data-testid={`tab-${tab.id}`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {showBadge && (
                    <Badge variant="destructive" className="ml-auto h-4 px-1 text-[10px]">
                      {emptyPacksCount}
                    </Badge>
                  )}
                </Button>
                </Fragment>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Tabs Navigation (mobile) */}
          <div className="md:hidden border-b border-primary/20 bg-card/50 flex-shrink-0">
            <ScrollArea className="w-full">
              <div className="flex p-2 gap-1 min-w-max">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const showBadge = tab.id === 'macos' && emptyPacksCount > 0;
                  const labelClass = (tab as any).alwaysShowLabel ? 'inline' : 'hidden sm:inline';
                  return (
                    <Button
                      key={tab.id}
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className={`flex items-center gap-2 whitespace-nowrap ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                      data-testid={`tab-mobile-${tab.id}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className={labelClass}>{tab.label}</span>
                      {showBadge && (
                        <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                          {emptyPacksCount}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Tab Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20">
              {/* Auto-unlock substitui o prompt de áudio — primeira interação libera */}
              <Suspense fallback={<TabSkeleton />}>
                {renderTabContent()}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
      <AdminTutorialModal
        open={showTutorial}
        onOpenChange={setShowTutorial}
        onNavigateToTab={setActiveTab}
      />
    </div>
  );
}
