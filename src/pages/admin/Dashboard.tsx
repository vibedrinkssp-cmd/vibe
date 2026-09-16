import { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
  
  Store,
  Cigarette,
  MapPin,
  ClipboardCheck,
  CalendarDays,
  Fingerprint,
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

const IfoodTestTab = lazy(() => import('./tabs/IfoodTestTab').then(m => ({ default: m.IfoodTestTab })));
const SyncInTab = lazy(() => import('./tabs/SyncInTab').then(m => ({ default: m.SyncInTab })));
const ScheduleTab = lazy(() => import('./tabs/ScheduleTab').then(m => ({ default: m.ScheduleTab })));

const MotoboyClosureTab = lazy(() => import('./tabs/MotoboyClosureTab').then(m => ({ default: m.MotoboyClosureTab })));
const TimeClockTab = lazy(() => import('./tabs/TimeClockTab').then(m => ({ default: m.TimeClockTab })));

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
  { id: 'pedidos', label: 'Pedidos', icon: Package },
  { id: 'delivery', label: 'Delivery', icon: Truck },
  { id: 'tracking', label: 'Tracking', icon: MapPin },
  { id: 'caixa', label: 'Caixa', icon: Wallet },
  { id: 'saqdep', label: 'Saques', icon: ArrowUpFromLine },
  { id: 'garrafas', label: 'Garrafas', icon: Wine, alwaysShowLabel: true },
  { id: 'macos', label: 'Maços', icon: Cigarette, alwaysShowLabel: true },
  { id: 'sangrias', label: 'Sangrias', icon: Receipt },
  { id: 'fechamento', label: 'Fechamento', icon: Calculator },
  { id: 'fechamento-boys', label: 'Fech. Boys', icon: ClipboardCheck },
  { id: 'estoque', label: 'Estoque', icon: Warehouse },
  { id: 'barcodes', label: 'Códigos de Barras', icon: ScanLine },
  // Caderneta removed — only in Manager
  { id: 'clientes', label: 'Clientes', icon: Users },
  
  { id: 'motoboys', label: 'Motoboys', icon: Bike },
  
  { id: 'ifood-teste', label: 'iFood TESTE', icon: Store, alwaysShowLabel: true },
  { id: 'sync-in', label: 'SYNC IN', icon: ClipboardCheck, alwaysShowLabel: true },
  { id: 'escala', label: 'ESCALA', icon: CalendarDays, alwaysShowLabel: true },
  { id: 'ponto', label: 'PONTO', icon: Fingerprint, alwaysShowLabel: true },
  
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
      if (error) return [];
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
      case 'garrafas': return <BottlesTab readOnly />;
      case 'macos': return <PacksTab />;
      case 'sangrias': return <SangriasTab />;
      case 'fechamento': return <CashClosureTab />;
      case 'fechamento-boys': return <MotoboyClosureTab />;
      case 'estoque': return <StockTab readOnly />;
      case 'barcodes': return <BarcodesTab />;
      // caderneta removed from admin
      case 'clientes': return <ClientsTab />;
      
      case 'motoboys': return <MotoboysTab />;
      
      case 'ifood-teste': return <IfoodTestTab />;
      case 'sync-in': return <SyncInTab />;
      case 'escala': return <ScheduleTab />;
      case 'ponto': return <TimeClockTab />;
      
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

      {/* Tabs Navigation */}
      <div className="border-b border-primary/20 bg-card/50 flex-shrink-0">
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
                  data-testid={`tab-${tab.id}`}
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
      <AdminTutorialModal
        open={showTutorial}
        onOpenChange={setShowTutorial}
        onNavigateToTab={setActiveTab}
      />
    </div>
  );
}
