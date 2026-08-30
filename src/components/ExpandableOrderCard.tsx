import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock, Package, Truck, MapPin, Phone, User as UserIcon, MessageCircle, Bell, Edit2, CreditCard, Banknote, QrCode, Wallet, FileText, Store, CheckCircle2, UserCircle, Navigation, ExternalLink, Hash, Route, CalendarClock, Printer, Info, ShieldCheck, AlertTriangle } from 'lucide-react';
import { printOrderTicket } from '@/lib/print-ticket';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Order, OrderItem, Address, Motoboy } from '@/shared/schema';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS, getSalespersonLabel, type OrderStatus, type PaymentMethod, type OrderType } from '@/shared/schema';
import { isExternalOrder, getPlatformLabel, getPlatformColor } from '@/lib/external-platforms';

// Parse <!--META:{...}--> from order notes
function parseOrderMeta(notes?: string | null): Record<string, string> | null {
  if (!notes) return null;
  const match = notes.match(/<!--META:(.*?)-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function cleanAddressForNavigation(addressText: string): string {
  // Remove extra info like "Comp:", "Ref:", "CEP:" that confuse Google Maps
  let cleaned = addressText;
  // Extract just the street address part before "Comp:" or ", Ref:" or ", CEP:"
  const parts = cleaned.split(/,\s*(?:Comp:|Ref:|CEP:)/i);
  if (parts.length > 1) {
    // Keep only street + number + bairro + city
    const mainPart = parts[0].trim();
    // Try to find "Bairro:" in remaining parts
    const bairroMatch = addressText.match(/Bairro:\s*([^,]+)/i);
    const cityMatch = addressText.match(/,\s*([\w\s]+dos\s+\w+|[\w\s]+)\s*,?\s*CEP/i) || 
                      addressText.match(/(São José dos Campos|Sao Jose dos Campos)/i);
    let result = mainPart;
    if (bairroMatch) result += `, ${bairroMatch[1].trim()}`;
    if (cityMatch) result += `, ${cityMatch[1].trim()}`;
    return result;
  }
  return cleaned;
}

function openGoogleMapsFromText(addressText: string) {
  const cleaned = cleanAddressForNavigation(addressText);
  const query = encodeURIComponent(cleaned);
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`, '_blank');
}

function openWhatsApp(phone: string, message?: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  const url = message 
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${formattedPhone}`;
  window.open(url, '_blank');
}

function openPhoneCall(phone: string) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  if (cleanPhone) window.location.href = `tel:${cleanPhone}`;
}

function isExternalPlaceholderPhone(phone?: string | null): boolean {
  return /^EXT-/i.test((phone || '').trim());
}

function isPlatformProxyPhone(phone?: string | null): boolean {
  return /^0800/.test((phone || '').replace(/\D/g, ''));
}

function openGpsNavigation(address: Address) {
  // Uses geo: intent on Android (opens user's preferred GPS app like Waze/Google Maps)
  // Falls back to Google Maps directions URL which also works on iOS
  if (address.latitude && address.longitude) {
    // Try geo intent first (Android), fallback to Google Maps
    const geoUrl = `geo:${address.latitude},${address.longitude}?q=${address.latitude},${address.longitude}(${encodeURIComponent(address.street + ', ' + address.number)})`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address.latitude},${address.longitude}&travelmode=driving`;
    
    // On mobile, try geo: protocol first
    if (/Android/i.test(navigator.userAgent)) {
      window.location.href = geoUrl;
      // Fallback after short delay
      setTimeout(() => window.open(mapsUrl, '_blank'), 500);
    } else {
      window.open(mapsUrl, '_blank');
    }
  } else {
    const query = encodeURIComponent(
      `${address.street}, ${address.number}, ${address.neighborhood}, ${address.city} - ${address.state}`
    );
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}&travelmode=driving`, '_blank');
  }
}

function formatPhone(phone: string): string {
  if (isPlatformProxyPhone(phone)) return phone;
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 3)} ${clean.slice(3, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

const PAYMENT_ICONS: Record<PaymentMethod, typeof CreditCard> = {
  cash: Banknote,
  pix: QrCode,
  pix_pos: QrCode,
  card_pos: CreditCard,
  card_credit: CreditCard,
  card_debit: Wallet,
  mixed: CreditCard,
};

interface OrderItemWithNotes extends OrderItem {
  notes?: string;
  preparationIngredients?: Array<{
    id: string;
    orderItemId: string;
    ingredientProductId: string;
    quantity: number;
    ingredientProduct?: { id: string; name: string };
  }>;
}

interface OrderWithDetails extends Order {
  items?: OrderItemWithNotes[];
  userName?: string;
  userWhatsapp?: string;
  address?: Address;
  motoboy?: Motoboy;
}

interface ExpandableOrderCardProps {
  order: OrderWithDetails;
  defaultExpanded?: boolean;
  showActions?: boolean;
  actions?: React.ReactNode;
  /** Always-visible actions shown on the card even when collapsed (e.g. motoboy assignment) */
  quickActions?: React.ReactNode;
  variant?: 'default' | 'customer' | 'kitchen' | 'motoboy' | 'admin';
  statusColor?: string;
  showElapsedTime?: boolean;
  elapsedTimeDate?: Date | string | null;
  onOpenMaps?: (address: Address, orderId?: string) => void;
  onOpenWhatsApp?: (phone: string) => void;
  onEditDeliveryFee?: (orderId: string, newFee: number) => void;
  isEditingDeliveryFee?: boolean;
  /** Show pulsing "NOVO" indicator on card header */
  isNew?: boolean;
  /** Extra badge rendered in the card title header (e.g. STOCK OK) */
  titleBadge?: React.ReactNode;
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  accepted: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  preparing: 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
  ready: 'bg-green-600/20 text-green-300 border-green-600/30',
  dispatched: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  arrived: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  delivered: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
};

// Top bar colors for each status - solid background for high visibility
const STATUS_HEADER_BG: Record<OrderStatus, string> = {
  pending: 'bg-orange-500',
  accepted: 'bg-yellow-500',
  preparing: 'bg-emerald-400',
  ready: 'bg-green-600',
  dispatched: 'bg-sky-400',
  arrived: 'bg-blue-500',
  delivered: 'bg-purple-500',
  cancelled: 'bg-red-500',
};

const ORDER_PROGRESS_STEPS: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready', 'dispatched', 'arrived', 'delivered'];

function getProgressPercentage(status: OrderStatus): number {
  if (status === 'cancelled') return 0;
  const stepIndex = ORDER_PROGRESS_STEPS.indexOf(status);
  if (stepIndex === -1) return 0;
  return ((stepIndex + 1) / ORDER_PROGRESS_STEPS.length) * 100;
}

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getElapsedTime(date: Date | string | null): string {
  if (!date) return '0min';
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}min`;
}

export function ExpandableOrderCard({
  order,
  defaultExpanded = false,
  showActions = true,
  actions,
  quickActions,
  variant = 'default',
  statusColor,
  showElapsedTime = false,
  elapsedTimeDate,
  onOpenMaps,
  onOpenWhatsApp,
  onEditDeliveryFee,
  isEditingDeliveryFee = false,
  isNew = false,
  titleBadge,
}: ExpandableOrderCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showFeeDialog, setShowFeeDialog] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newDeliveryFee, setNewDeliveryFee] = useState<string>(String(order.deliveryFee || 0));
  const [ingredientsMap, setIngredientsMap] = useState<Record<string, any[]>>({});
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [isConfirmingMotoboyCash, setIsConfirmingMotoboyCash] = useState(false);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [proofLoaded, setProofLoaded] = useState(false);
  const [showProofModal, setShowProofModal] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Confirmação MANUAL do caixa: só conta como "validado" quando o admin/caixa
  // bateu o olho no pedido. Confirmações automáticas (PIX webhook, etc.) NÃO
  // contam — o caixa precisa validar fisicamente saída de produto x entrada de dinheiro.
  const confirmedBy = (order.paymentConfirmedBy || '').toLowerCase();
  const isManuallyConfirmed = !!order.paymentConfirmed
    && (confirmedBy.includes('caixa') || confirmedBy.includes('manual') || confirmedBy.includes('admin'));
  // Confirmação automática (sistema/webhook) — só pra exibir badge sutil, não tira o botão
  const isAutoConfirmed = !!order.paymentConfirmed && !isManuallyConfirmed;
  // Visual roxo "finalizado" só após validação manual
  const isPaymentConfirmed = isManuallyConfirmed;
  const canConfirmPayment = (variant === 'admin' || variant === 'default' || variant === 'kitchen') && order.status !== 'cancelled';

  // Recebimento físico do motoboy: só faz sentido para delivery em dinheiro,
  // após o motoboy ter saído (dispatched/arrived/delivered) e ainda não confirmado.
  const isDeliveryCash =
    (order.orderType as OrderType) === 'delivery' && (order.paymentMethod as PaymentMethod) === 'cash';
  const motoboyCashEligible =
    isDeliveryCash &&
    order.status !== 'cancelled' &&
    !isManuallyConfirmed &&
    (variant === 'admin' || variant === 'default') &&
    ['dispatched', 'arrived', 'delivered'].includes(order.status as string);

  const handleConfirmPayment = async () => {
    if (isConfirmingPayment || isManuallyConfirmed) return;
    setIsConfirmingPayment(true);
    try {
      const { error } = await supabase.rpc('confirm_order_payment_manual', {
        p_order_id: order.id,
        p_confirmed_by: 'Caixa (manual)',
      });
      if (error) throw error;
      toast({
        title: 'Pagamento confirmado',
        description: `Pedido #${order.id.slice(-6).toUpperCase()} marcado como pago.`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    } catch (err: any) {
      toast({
        title: 'Erro ao confirmar',
        description: err?.message ?? 'Não foi possível confirmar o pagamento.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const handleConfirmMotoboyCash = async () => {
    if (isConfirmingMotoboyCash || !motoboyCashEligible) return;
    setIsConfirmingMotoboyCash(true);
    try {
      const { data, error } = await supabase.rpc('confirm_cash_received', {
        p_order_id: order.id,
        p_responsible: 'Caixa (motoboy)',
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string; amount?: number };
      if (!result?.success) throw new Error(result?.error || 'Falha ao confirmar');
      toast({
        title: '💜 Dinheiro coletado do motoboy',
        description: `R$ ${Number(result.amount ?? order.total).toFixed(2).replace('.', ',')} adicionado ao caixa físico.`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['session-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-transactions'] });
    } catch (err: any) {
      toast({
        title: 'Erro ao coletar dinheiro',
        description: err?.message ?? 'Não foi possível registrar a coleta.',
        variant: 'destructive',
      });
    } finally {
      setIsConfirmingMotoboyCash(false);
    }
  };

  // Busca o comprovante de pagamento (foto do motoboy / PIX POS) sob demanda ao expandir
  useEffect(() => {
    if (!isExpanded || proofLoaded || variant === 'kitchen') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_order_payment_proof', {
          p_order_id: order.id,
        });
        if (!cancelled) {
          setPaymentProofUrl((data as string | null) ?? null);
          setProofLoaded(true);
        }
      } catch {
        if (!cancelled) setProofLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isExpanded, proofLoaded, order.id, variant]);



  // Ingredients are now handled directly in the order items if available
  // No need to fetch from a non-existent API endpoint
  
  const status = order.status as OrderStatus;
  const paymentMethod = order.paymentMethod as PaymentMethod;
  const orderType = order.orderType as OrderType;
  const colorClass = statusColor || STATUS_COLORS[status];
  const PaymentIcon = PAYMENT_ICONS[paymentMethod] || CreditCard;

  const orderId = order.id.slice(-6).toUpperCase();
  const customerName = order.customerName || order.userName || 'Cliente';

  const showCustomerSection = variant !== 'customer';
  const orderUserPhone = isExternalPlaceholderPhone(order.userWhatsapp) ? null : order.userWhatsapp;
  const showMotoboySection = order.motoboy || (order.motoboyId && !order.motoboy) || (orderType === 'delivery' && status === 'ready' && !order.motoboyId);
  
  // Parse META from external orders (iFood, Rappi, etc.)
  const isExternal = isExternalOrder(order);
  const orderMeta = isExternal ? parseOrderMeta(order.notes) : null;
  const addressPreview = order.address
    ? `${order.address.street}, ${order.address.number} - ${order.address.neighborhood}`
    : orderType === 'delivery' && orderMeta?.endereco
      ? orderMeta.endereco
      : null;
  const externalPhone = orderMeta?.telefone || null;
  const displayPhone = externalPhone || orderUserPhone || null;
  const canWhatsAppDisplayPhone = !!displayPhone && !isPlatformProxyPhone(displayPhone);
  const canCallDisplayPhone = !!displayPhone;
  const showAddressSection = orderType === 'delivery' && !!order.address;
  
  // For external orders, use the correct total from meta (cobrar_cliente or total_ifood)
  const externalTotal = (() => {
    if (!orderMeta) return null;
    const cobrar = orderMeta['cobrar_cliente'];
    if (cobrar) {
      const v = Number(cobrar.replace(/[R$\s]/g, '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) return v;
    }
    const totalIfood = orderMeta['total_ifood'];
    if (totalIfood) {
      const v = Number(totalIfood.replace(/[R$\s]/g, '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) return v;
    }
    return null;
  })();
  const displayTotal = externalTotal ?? order.total;

  // Valor que o motoboy PRECISA cobrar do cliente (dinheiro/maquininha) em pedidos
  // externos (iFood etc.). Mesmo quando o pedido aparece como "pago via app", se a
  // plataforma indica "Cobrar do cliente" > 0, o motoboy recebeu na entrega e precisa
  // prestar contas. Isso costuma passar despercebido no fechamento.
  const chargeCustomerAmount = (() => {
    if (!orderMeta) return 0;
    const cobrar = orderMeta['cobrar_cliente'];
    if (!cobrar) return 0;
    const v = Number(cobrar.replace(/[R$\s]/g, '').replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : 0;
  })();
  const needsCustomerCharge = isExternal && chargeCustomerAmount > 0;
  
  
  // Check if we have customer data to show
  const hasCustomerData = order.userName || orderUserPhone || order.customerName || externalPhone || order.address || orderMeta?.endereco;

  return (
    <Card 
      className={`bg-card border-primary/20 overflow-hidden transition-colors ${variant === 'kitchen' ? 'border-l-4' : ''} ${isPaymentConfirmed ? 'bg-purple-500/5 border-purple-500/30' : ''}`}
      style={variant === 'kitchen' ? { borderLeftColor: status === 'preparing' ? '#f97316' : status === 'ready' ? '#22c55e' : '#3b82f6' } : undefined}
      data-testid={`order-card-${order.id}`}
      data-payment-confirmed={isPaymentConfirmed ? 'true' : 'false'}
    >
      {/* Status color header with order code and badge */}
      <div className={`${STATUS_HEADER_BG[status]} px-3 md:px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-sm md:text-base drop-shadow-sm">#{orderId}</span>
          {isNew && (
            <Badge className="bg-white text-red-600 border-0 text-[10px] font-black animate-pulse px-1.5 py-0 leading-4 shadow-lg">
              🔔 NOVO
            </Badge>
          )}
          {isPaymentConfirmed && (
            <Badge className="bg-white/95 text-purple-700 border-0 text-[10px] font-black px-1.5 py-0 leading-4 shadow-md gap-1" data-testid={`badge-paid-${order.id}`}>
              <ShieldCheck className="h-3 w-3" />
              PAGO
            </Badge>
          )}
          {isAutoConfirmed && !isManuallyConfirmed && (
            <Badge variant="outline" className="bg-white/80 text-amber-700 border-amber-400 text-[10px] font-bold px-1.5 py-0 leading-4 shadow-sm gap-1" data-testid={`badge-auto-paid-${order.id}`}>
              <ShieldCheck className="h-3 w-3" />
              PIX OK · VALIDAR
            </Badge>
          )}
          {isDeliveryCash && isManuallyConfirmed && (
            <Badge className="bg-white/95 text-emerald-700 border-0 text-[10px] font-black px-1.5 py-0 leading-4 shadow-md gap-1" data-testid={`badge-cash-collected-${order.id}`}>
              <Banknote className="h-3 w-3" />
              💵 COLETADO
            </Badge>
          )}
          {titleBadge}
        </div>
        <div className="flex items-center gap-2">
          {isExternal && order.salesperson && (
            <Badge className={`${getPlatformColor(order.salesperson)} border text-xs`}>
              {getPlatformLabel(order.salesperson)}
            </Badge>
          )}
          <Badge className="bg-white/20 text-white border-white/30 border text-xs backdrop-blur-sm">
            {ORDER_STATUS_LABELS[status]}
          </Badge>
        </div>
      </div>

      {/* Aviso crítico: pedido externo que exige cobrança na entrega (dinheiro/maquininha).
          Sempre visível (mesmo recolhido) para o motoboy/caixa não esquecer de prestar contas. */}
      {needsCustomerCharge && (
        <div className="mx-3 mt-3 rounded-lg border-2 border-amber-500/70 bg-amber-500/15 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-amber-300 font-bold text-sm leading-tight">
                ⚠️ COBRAR DO CLIENTE NA ENTREGA
              </p>
              <p className="text-amber-200 text-xs leading-snug mt-0.5">
                Este pedido NÃO foi pago pelo app. O motoboy recebeu{' '}
                <span className="font-bold">{formatCurrency(chargeCustomerAmount)}</span>{' '}
                em dinheiro/maquininha e precisa prestar contas no fechamento.
              </p>
            </div>
          </div>
        </div>
      )}

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {variant === 'customer' && status !== 'cancelled' && (
          <div className="px-4 pt-3" data-testid={`progress-bar-${order.id}`}>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                style={{ width: `${getProgressPercentage(status)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Pedido</span>
              <span>Entregue</span>
            </div>
          </div>
        )}

        {variant === 'customer' && status === 'arrived' && (
          <div 
            className="mx-4 mt-3 bg-cyan-500/20 border border-cyan-500/50 rounded-lg p-3 animate-pulse"
            data-testid={`alert-arrived-${order.id}`}
          >
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-cyan-400" />
              <div>
                <p className="text-cyan-300 font-semibold text-sm">Motoboy chegou!</p>
                <p className="text-cyan-200 text-xs">Va ate a porta receber seu pedido</p>
              </div>
            </div>
          </div>
        )}

        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover-elevate py-3 px-3 md:px-4">
            <div className="flex items-start sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <div className="flex flex-col min-w-0 gap-1">
                   <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                     {paymentMethod === 'pix' && status !== 'cancelled' && (
                       order.paymentConfirmed ? (
                         <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs flex" data-testid={`badge-pix-paid-${order.id}`}>
                           <CheckCircle2 className="h-3 w-3 mr-1" />
                           PIX PAGO
                         </Badge>
                       ) : (
                         <Badge className="bg-red-500/20 text-red-400 border border-red-500/40 text-xs flex font-bold animate-pulse" data-testid={`badge-pix-unpaid-${order.id}`}>
                           <AlertTriangle className="h-3 w-3 mr-1" />
                           PIX NÃO CONFIRMADO
                         </Badge>
                       )
                     )}
                   </div>
                  <div className="flex items-center gap-1 md:gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-sm md:text-base truncate max-w-[120px] sm:max-w-none" data-testid={`customer-name-${order.id}`}>
                      {customerName}
                    </span>
                    <span className="text-muted-foreground/50 hidden sm:inline">|</span>
                    <Badge variant="outline" className="text-xs" data-testid={`badge-order-type-${order.id}`}>
                      {orderType === 'counter' ? <Store className="h-3 w-3 mr-1" /> : <Truck className="h-3 w-3 mr-1" />}
                      <span className="hidden sm:inline">{ORDER_TYPE_LABELS[orderType]}</span>
                    </Badge>
                    <Badge variant="outline" className="text-xs hidden md:flex" data-testid={`badge-payment-${order.id}`}>
                      <PaymentIcon className="h-3 w-3 mr-1" />
                      {PAYMENT_METHOD_LABELS[paymentMethod]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span data-testid={`order-date-${order.id}`}>{formatDate(order.createdAt)}</span>
                  </div>
                  {/* Address preview in header for delivery orders */}
                  {orderType === 'delivery' && addressPreview && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="h-3 w-3 text-primary flex-shrink-0" />
                      <span className="truncate max-w-[180px] sm:max-w-[280px]">
                        {addressPreview}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
                {showElapsedTime && elapsedTimeDate && (
                  <Badge className={`${colorClass} border flex items-center gap-1 text-xs`} data-testid={`badge-elapsed-${order.id}`}>
                    <Clock className="h-3 w-3" />
                    {getElapsedTime(elapsedTimeDate)}
                  </Badge>
                )}
                {hasCustomerData && variant !== 'customer' && (
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-7 w-7 md:h-8 md:w-8 text-muted-foreground hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCustomerModal(true);
                    }}
                    data-testid={`button-customer-info-${order.id}`}
                  >
                    <UserCircle className="h-4 w-4 md:h-5 md:w-5" />
                  </Button>
                )}
                <span className="font-bold text-primary text-base md:text-lg" data-testid={`order-total-${order.id}`}>{formatCurrency(displayTotal)}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" data-testid={`button-toggle-${order.id}`}>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        {quickActions && (
          <div
            className="px-3 md:px-4 pb-3"
            onClick={(e) => e.stopPropagation()}
            data-testid={`section-quick-actions-${order.id}`}
          >
            {quickActions}
          </div>
        )}

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4 space-y-4">
            {/* Full Order ID */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
              <Hash className="h-3 w-3 flex-shrink-0" />
              <span className="font-mono select-all break-all">{order.id}</span>
            </div>

            {/* Customer section - show always for non-customer variants */}
            {showCustomerSection && hasCustomerData && (
              <div 
                className="bg-green-500/10 border border-green-500/30 rounded-lg p-3"
                data-testid={`section-customer-${order.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-green-500/20 rounded-full p-2">
                      <UserIcon className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground" data-testid={`customer-name-expanded-${order.id}`}>
                        {customerName}
                      </p>
                      {displayPhone && (
                        <p className="text-sm text-muted-foreground" data-testid={`customer-phone-${order.id}`}>
                          {formatPhone(displayPhone)}
                        </p>
                      )}
                    </div>
                  </div>
                  {canCallDisplayPhone && (
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-green-600 text-white flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canWhatsAppDisplayPhone) {
                          openWhatsApp(displayPhone!, `Olá! Sobre o pedido #${orderId} da VM Brasil...`);
                        } else {
                          openPhoneCall(displayPhone!);
                        }
                      }}
                      data-testid={`button-whatsapp-customer-${order.id}`}
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      {canWhatsAppDisplayPhone ? 'WhatsApp' : 'Ligar'}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {showAddressSection && order.address && (
              <div 
                className="bg-secondary/50 rounded-lg p-3"
                data-testid={`section-address-${order.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="bg-primary/20 rounded-full p-2 flex-shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-sm space-y-1">
                    <p className="text-foreground font-medium" data-testid={`address-street-${order.id}`}>
                      {order.address.street}, {order.address.number}
                    </p>
                    {order.address.complement && (
                      <p className="text-muted-foreground" data-testid={`address-complement-${order.id}`}>
                        {order.address.complement}
                      </p>
                    )}
                    <p data-testid={`address-neighborhood-${order.id}`}>
                      <Badge variant="secondary" className="text-xs font-medium">
                        {order.address.neighborhood}
                      </Badge>
                      <span className="text-muted-foreground ml-2">
                        {order.address.city}/{order.address.state}
                      </span>
                    </p>
                    <p className="text-muted-foreground text-xs" data-testid={`address-cep-${order.id}`}>
                      CEP: {order.address.zipCode}
                    </p>
                    {order.address.notes && (
                      <div className="bg-primary/10 border border-primary/30 rounded p-2 mt-2" data-testid={`address-reference-${order.id}`}>
                        <p className="text-primary text-xs font-medium">Referencia:</p>
                        <p className="text-foreground text-xs">{order.address.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Prominent GPS Navigation Button - iFood style */}
                <Button
                  className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white py-3 text-sm font-semibold"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onOpenMaps) {
                      onOpenMaps(order.address!, order.id);
                    } else {
                      openGpsNavigation(order.address!);
                    }
                  }}
                  data-testid={`button-navigate-gps-${order.id}`}
                >
                  <Navigation className="h-5 w-5 mr-2" />
                  Navegar (GPS embutido)
                </Button>
              </div>
            )}

            {/* External order META info (iFood, Rappi etc.) */}
            {isExternal && orderMeta && (
              <div className="space-y-3">
                {/* Platform & Order Info */}
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3" data-testid={`section-external-meta-${order.id}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="h-4 w-4 text-red-400" />
                    <h4 className="text-sm font-medium text-red-400">Dados {orderMeta.plataforma || 'Plataforma'}</h4>
                  </div>
                  <div className="grid gap-1.5 text-sm">
                    {orderMeta.pedido && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pedido</span>
                        <span className="text-foreground font-mono font-medium">{orderMeta.pedido}</span>
                      </div>
                    )}
                    {orderMeta.localizador && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Localizador</span>
                        <span className="text-foreground font-mono font-medium">{orderMeta.localizador}</span>
                      </div>
                    )}
                    {orderMeta.cod_coleta && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cód. Coleta</span>
                        <span className="text-foreground font-mono font-medium">{orderMeta.cod_coleta}</span>
                      </div>
                    )}
                    {orderMeta.tipo_entrega && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tipo Entrega</span>
                        <span className="text-foreground">{orderMeta.tipo_entrega}</span>
                      </div>
                    )}
                    {orderMeta.previsao && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Previsão</span>
                        <span className="text-foreground">{orderMeta.previsao}</span>
                      </div>
                    )}
                    {orderMeta.data && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data Pedido</span>
                        <span className="text-foreground">{orderMeta.data}</span>
                      </div>
                    )}
                    {orderMeta.pagamento && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pagamento</span>
                        <span className="text-foreground">{orderMeta.pagamento}</span>
                      </div>
                    )}
                    {orderMeta.status_pgto && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status Pgto</span>
                        <span className="text-foreground">{orderMeta.status_pgto}</span>
                      </div>
                    )}
                    {orderMeta.taxa_servico && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxa Serviço</span>
                        <span className="text-foreground">{orderMeta.taxa_servico}</span>
                      </div>
                    )}
                    {orderMeta.taxa_entrega && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Taxa Entrega</span>
                        <span className="text-foreground">{orderMeta.taxa_entrega}</span>
                      </div>
                    )}
                    {orderMeta.total_ifood && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total iFood</span>
                        <span className="text-foreground font-medium">{orderMeta.total_ifood}</span>
                      </div>
                    )}
                    {orderMeta.cobrar_cliente && (
                      <div className="flex justify-between bg-yellow-500/10 rounded px-2 py-1">
                        <span className="text-yellow-400 font-medium">💰 Cobrar Cliente</span>
                        <span className="text-yellow-400 font-bold">{orderMeta.cobrar_cliente}</span>
                      </div>
                    )}
                    {orderMeta.obs && (
                      <div className="bg-primary/10 border border-primary/30 rounded p-2 mt-1">
                        <p className="text-primary text-xs font-medium">Obs:</p>
                        <p className="text-foreground text-xs">{orderMeta.obs}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* External order phone */}
                {orderMeta.telefone && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-green-500/20 rounded-full p-2">
                          <Phone className="h-5 w-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Telefone do Cliente</p>
                          <p className="font-medium text-foreground">{orderMeta.telefone}</p>
                          {isPlatformProxyPhone(orderMeta.telefone) && (
                            <p className="text-xs text-muted-foreground">Número mascarado da plataforma</p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="default"
                        size="sm"
                        className="bg-green-600 text-white flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isPlatformProxyPhone(orderMeta.telefone)) {
                            openPhoneCall(orderMeta.telefone!);
                          } else {
                            openWhatsApp(orderMeta.telefone!, `Olá! Sobre o pedido ${orderMeta.pedido || ''} da VM Brasil...`);
                          }
                        }}
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        {isPlatformProxyPhone(orderMeta.telefone) ? 'Ligar' : 'WhatsApp'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* External order address */}
                {orderMeta.endereco && (() => {
                  const isIncomplete = orderMeta.endereco_incompleto === 'true' || /⚠️\s*INCOMPLETO/i.test(orderMeta.endereco);
                  return (
                    <div className={`rounded-lg p-3 ${isIncomplete ? 'bg-destructive/10 border-2 border-destructive' : 'bg-secondary/50'}`}>
                      {isIncomplete && (
                        <div className="mb-2 flex items-center gap-2 rounded bg-destructive px-2 py-1 text-xs font-bold text-destructive-foreground">
                          ⚠️ ENDEREÇO INCOMPLETO — LIGAR PARA CONFIRMAR
                          {orderMeta.endereco_faltando && (
                            <span className="ml-auto opacity-90">faltando: {orderMeta.endereco_faltando}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <div className={`rounded-full p-2 flex-shrink-0 ${isIncomplete ? 'bg-destructive/30' : 'bg-primary/20'}`}>
                          <MapPin className={`h-5 w-5 ${isIncomplete ? 'text-destructive' : 'text-primary'}`} />
                        </div>
                        <div className="flex-1 text-sm">
                          <p className="text-foreground font-medium">Endereço de Entrega</p>
                          <p className={`mt-1 ${isIncomplete ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{orderMeta.endereco}</p>
                        </div>
                      </div>
                      <Button
                        className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white py-3 text-sm font-semibold"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGoogleMapsFromText(orderMeta.endereco!);
                        }}
                      >
                        <Navigation className="h-5 w-5 mr-2" />
                        Navegar até o endereço
                        <ExternalLink className="h-4 w-4 ml-2 opacity-70" />
                      </Button>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="border-t border-border pt-4" data-testid={`section-items-${order.id}`}>
              <div className="flex items-center gap-2 mb-3">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-muted-foreground">Itens do Pedido</h4>
                <Badge variant="secondary" className="text-xs">{order.items?.length || 0} itens</Badge>
              </div>
              <div className="bg-secondary/50 rounded-lg p-3 space-y-3">
                {order.items?.map((item, idx) => (
                  <div key={idx} data-testid={`item-${order.id}-${idx}`}>
                    <div className="flex justify-between items-start text-sm">
                      <div className="flex-1">
                        <span className="text-foreground font-medium" data-testid={`item-name-${order.id}-${idx}`}>
                          {item.quantity}x {item.productName}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span data-testid={`item-unit-price-${order.id}-${idx}`}>
                            {formatCurrency(item.unitPrice)} un.
                          </span>
                        </div>
                      </div>
                      <span className="text-foreground font-medium" data-testid={`item-total-${order.id}-${idx}`}>
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>
                    {item.notes && (
                      <div className="mt-1 text-xs text-primary bg-primary/10 rounded px-2 py-1" data-testid={`item-notes-${order.id}-${idx}`}>
                        Obs: {item.notes}
                      </div>
                    )}
                    {ingredientsMap[item.id] && ingredientsMap[item.id].length > 0 && (
                      <div className="mt-2 text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1" data-testid={`item-ingredients-${order.id}-${idx}`}>
                        <span className="font-medium">Ingredientes usados:</span>
                        <div className="mt-1">
                          {ingredientsMap[item.id].map((ing) => (
                            <div key={ing.id}>
                              • {ing.ingredientProduct?.name || 'Produto desconhecido'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {idx < (order.items?.length || 0) - 1 && (
                      <Separator className="mt-2" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-secondary/30 rounded-lg p-3 space-y-2" data-testid={`section-payment-${order.id}`}>
              <div className="flex items-center gap-2 mb-2">
                <PaymentIcon className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-muted-foreground">Pagamento</h4>
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between" data-testid={`payment-subtotal-${order.id}`}>
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="text-foreground">{formatCurrency(order.subtotal)}</span>
                </div>
                
                {Number(order.discount || 0) > 0 && (
                  <div className="flex justify-between text-green-400" data-testid={`payment-discount-${order.id}`}>
                    <span>Desconto</span>
                    <span>-{formatCurrency(order.discount || 0)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center" data-testid={`payment-delivery-fee-${order.id}`}>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Taxa de Entrega</span>
                    {order.deliveryFeeAdjusted && (
                      <Badge variant="outline" className="text-xs text-primary border-primary/50">Ajustada</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-foreground">{formatCurrency(order.deliveryFee)}</span>
                    {variant === 'admin' && onEditDeliveryFee && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewDeliveryFee(String(order.deliveryFee || 0));
                          setShowFeeDialog(true);
                        }}
                        data-testid={`button-edit-fee-${order.id}`}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex justify-between font-semibold text-base" data-testid={`payment-total-${order.id}`}>
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatCurrency(displayTotal)}</span>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex items-center justify-between" data-testid={`payment-method-detail-${order.id}`}>
                  <span className="text-muted-foreground">Forma de Pagamento</span>
                  <Badge variant="outline" className={`text-xs ${
                    paymentMethod === 'pix' ? 'border-green-500/50 text-green-400' :
                    paymentMethod === 'cash' ? 'border-yellow-500/50 text-yellow-400' :
                    paymentMethod === 'card_credit' ? 'border-blue-500/50 text-blue-400' :
                    paymentMethod === 'card_debit' ? 'border-purple-500/50 text-purple-400' :
                    paymentMethod === 'card_pos' ? 'border-cyan-500/50 text-cyan-400' : ''
                  }`}>
                    <PaymentIcon className="h-3 w-3 mr-1" />
                    {PAYMENT_METHOD_LABELS[paymentMethod]}
                  </Badge>
                </div>
                
                {/* Tipo de pedido */}
                <div className="flex items-center justify-between mt-1" data-testid={`order-type-detail-${order.id}`}>
                  <span className="text-muted-foreground">Tipo de Pedido</span>
                  <Badge variant="outline" className={`text-xs ${
                    orderType === 'delivery' ? 'border-primary/50 text-primary' : 'border-muted-foreground/50'
                  }`}>
                    {orderType === 'counter' ? <Store className="h-3 w-3 mr-1" /> : <Truck className="h-3 w-3 mr-1" />}
                    {ORDER_TYPE_LABELS[orderType]}
                  </Badge>
                </div>
                
                {/* Vendedor */}
                {order.salesperson && (
                  <div className="flex items-center justify-between mt-1" data-testid={`salesperson-detail-${order.id}`}>
                    <span className="text-muted-foreground">Vendedor</span>
                    <Badge variant="secondary" className="text-xs">
                      <UserIcon className="h-3 w-3 mr-1" />
                      {getSalespersonLabel(order.salesperson)}
                    </Badge>
                  </div>
                )}
                
                {/* Distância de entrega */}
                {orderType === 'delivery' && order.deliveryDistance && Number(order.deliveryDistance) > 0 && (
                  <div className="flex items-center justify-between mt-1" data-testid={`delivery-distance-${order.id}`}>
                    <span className="text-muted-foreground">Distância</span>
                    <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                      <Route className="h-3 w-3 mr-1" />
                      {Number(order.deliveryDistance).toFixed(1)} km
                    </Badge>
                  </div>
                )}
                
                {paymentMethod === 'cash' && order.changeFor && Number(order.changeFor) > 0 && (
                  <div className="bg-primary/10 border border-primary/30 rounded p-2 mt-2" data-testid={`payment-change-${order.id}`}>
                    <div className="flex justify-between items-center">
                      <span className="text-primary font-medium">Troco para</span>
                      <span className="text-primary font-bold">{formatCurrency(order.changeFor)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mt-1">
                      <span className="text-muted-foreground">Troco a devolver</span>
                      <span className="text-accent">{formatCurrency(Number(order.changeFor) - Number(displayTotal))}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Comprovante de pagamento (foto tirada pelo motoboy / PIX POS) */}
              {paymentProofUrl && (
                <div className="pt-3 mt-2 border-t border-border" data-testid={`payment-proof-${order.id}`}>
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
                    <FileText className="h-4 w-4" />
                    <span>Comprovante de pagamento</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowProofModal(true); }}
                    className="block rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
                  >
                    <img
                      src={paymentProofUrl}
                      alt="Comprovante de pagamento"
                      loading="lazy"
                      className="w-full max-h-44 object-contain bg-black"
                    />
                  </button>
                  <p className="text-[11px] text-muted-foreground mt-1">Toque para ampliar</p>
                </div>
              )}



              {/* Confirmação manual de recebimento de pagamento (caixa) */}
              {canConfirmPayment && (
                <div className="pt-3 mt-2 border-t border-border space-y-2">
                  {isPaymentConfirmed ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-purple-500/10 border border-purple-500/30 px-3 py-2" data-testid={`payment-confirmed-banner-${order.id}`}>
                      <div className="flex items-center gap-2 text-purple-300 text-sm font-medium">
                        {isDeliveryCash ? <Banknote className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                        <span>
                          {isDeliveryCash
                            ? '💵 Dinheiro coletado do motoboy — entrou no caixa'
                            : 'Pagamento confirmado pelo caixa'}
                        </span>
                      </div>
                      {order.paymentConfirmedAt && (
                        <span className="text-xs text-purple-300/70 font-mono">
                          {formatDate(order.paymentConfirmedAt)}
                        </span>
                      )}
                    </div>
                  ) : motoboyCashEligible ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-5 shadow-lg shadow-emerald-600/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmMotoboyCash();
                      }}
                      disabled={isConfirmingMotoboyCash}
                      data-testid={`button-confirm-motoboy-cash-${order.id}`}
                    >
                      <Banknote className="h-5 w-5 mr-2" />
                      {isConfirmingMotoboyCash
                        ? 'Registrando entrada no caixa...'
                        : `💵 Dinheiro Coletado do Motoboy — R$ ${Number(order.total).toFixed(2).replace('.', ',')}`}
                    </Button>
                  ) : (
                    <Button
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmPayment();
                      }}
                      disabled={isConfirmingPayment}
                      data-testid={`button-confirm-payment-${order.id}`}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      {isConfirmingPayment ? 'Confirmando...' : 'Confirmar Recebimento do Pagamento'}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Observações do pedido */}
            {order.notes && !order.notes.startsWith('<!--META:') && (
              <div className="bg-primary/10 border border-primary/30 rounded-lg p-3" data-testid={`section-notes-${order.id}`}>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-primary" />
                  <p className="text-primary text-sm font-medium">Observacoes do Pedido</p>
                </div>
                <p className="text-foreground text-sm">{order.notes}</p>
              </div>
            )}

            {/* Timeline de timestamps */}
            <div className="bg-secondary/30 rounded-lg p-3 space-y-1" data-testid={`section-timeline-${order.id}`}>
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-medium text-muted-foreground">Histórico do Pedido</h4>
              </div>
              <div className="grid gap-1 text-xs">
                {order.createdAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">📋 Criado</span>
                    <span className="text-foreground font-mono">{formatDate(order.createdAt)}</span>
                  </div>
                )}
                {order.acceptedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">✅ Aceito</span>
                    <span className="text-foreground font-mono">{formatDate(order.acceptedAt)}</span>
                  </div>
                )}
                {order.preparingAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">👨‍🍳 Preparando</span>
                    <span className="text-foreground font-mono">{formatDate(order.preparingAt)}</span>
                  </div>
                )}
                {order.readyAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">📦 Pronto</span>
                    <span className="text-foreground font-mono">{formatDate(order.readyAt)}</span>
                  </div>
                )}
                {order.dispatchedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">🏍️ Despachado</span>
                    <span className="text-foreground font-mono">{formatDate(order.dispatchedAt)}</span>
                  </div>
                )}
                {order.arrivedAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">📍 Chegou</span>
                    <span className="text-foreground font-mono">{formatDate(order.arrivedAt)}</span>
                  </div>
                )}
                {order.deliveredAt && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">🎉 Entregue</span>
                    <span className="text-foreground font-mono">{formatDate(order.deliveredAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {showMotoboySection && (
              <>
                {order.motoboy && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3" data-testid={`section-motoboy-${order.id}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 rounded-full p-2">
                          <Truck className="h-5 w-5 text-purple-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground" data-testid={`motoboy-name-${order.id}`}>
                            {order.motoboy.name}
                          </p>
                          {order.motoboy.whatsapp && (
                            <p className="text-sm text-muted-foreground" data-testid={`motoboy-phone-${order.id}`}>
                              {formatPhone(order.motoboy.whatsapp)}
                            </p>
                          )}
                        </div>
                      </div>
                      {order.motoboy.whatsapp && (
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-purple-600 text-white flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openWhatsApp(order.motoboy!.whatsapp, `Ola! Sobre o pedido #${orderId} da VM Brasil...`);
                          }}
                          data-testid={`button-whatsapp-motoboy-${order.id}`}
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Ligar
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {order.motoboyId && !order.motoboy && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3" data-testid={`motoboy-assigned-${order.id}`}>
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-purple-400" />
                      <span className="text-sm text-purple-300">Motoboy atribuido</span>
                    </div>
                  </div>
                )}

                {orderType === 'delivery' && status === 'ready' && !order.motoboyId && (
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 text-center" data-testid={`motoboy-pending-${order.id}`}>
                    <Truck className="h-6 w-6 text-purple-400 mx-auto mb-1" />
                    <p className="text-purple-300 text-sm">Aguardando atribuicao de motoboy</p>
                  </div>
                )}
              </>
            )}

            {/* Print Ticket Button */}
            {(variant === 'admin' || variant === 'default' || variant === 'kitchen') && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    printOrderTicket(order);
                  }}
                  data-testid={`button-print-ticket-${order.id}`}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Ticket
                </Button>
              </div>
            )}

            {showActions && actions && (
              <div className="pt-2 border-t border-border" data-testid={`section-actions-${order.id}`}>
                {actions}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      {/* Modal: comprovante de pagamento ampliado */}
      <Dialog open={showProofModal} onOpenChange={setShowProofModal}>
        <DialogContent className="max-w-lg p-2">
          <DialogHeader className="p-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Comprovante — #{order.id.slice(-6).toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          {paymentProofUrl && (
            <img
              src={paymentProofUrl}
              alt="Comprovante de pagamento"
              className="w-full max-h-[75vh] object-contain bg-black rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>



      {/* Modal de Dados do Cliente */}
      <Dialog open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" />
              Dados do Cliente
            </DialogTitle>
            <DialogDescription>Informações do cliente para o pedido #{orderId}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-secondary/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 rounded-full p-3">
                  <UserIcon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-lg">{customerName}</p>
                  <p className="text-sm text-muted-foreground">Cliente</p>
                </div>
              </div>
              
              {displayPhone && (
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="text-foreground">{formatPhone(displayPhone)}</span>
                      {isPlatformProxyPhone(displayPhone) && (
                        <p className="text-xs text-muted-foreground">Número mascarado da plataforma</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => canWhatsAppDisplayPhone
                      ? openWhatsApp(displayPhone!, `Olá! Sobre o pedido #${orderId} da VM Brasil...`)
                      : openPhoneCall(displayPhone!)}
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    {canWhatsAppDisplayPhone ? 'WhatsApp' : 'Ligar'}
                  </Button>
                </div>
              )}
              
              {order.address && (
                <div className="p-3 bg-background rounded-lg border space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">Endereço de Entrega</span>
                  </div>
                  <p className="text-foreground">
                    {order.address.street}, {order.address.number}
                    {order.address.complement && ` - ${order.address.complement}`}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {order.address.neighborhood}, {order.address.city}/{order.address.state}
                  </p>
                  {order.address.zipCode && (
                    <p className="text-muted-foreground text-xs">CEP: {order.address.zipCode}</p>
                  )}
                  {order.address.notes && (
                    <div className="bg-primary/10 border border-primary/30 rounded p-2 mt-2">
                      <p className="text-primary text-xs font-medium">Referência:</p>
                      <p className="text-foreground text-sm">{order.address.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {!order.address && orderMeta?.endereco && (
                <div className="p-3 bg-background rounded-lg border space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm font-medium">Endereço de Entrega</span>
                  </div>
                  <p className="text-foreground text-sm">{orderMeta.endereco}</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Taxa de Entrega */}
      <Dialog open={showFeeDialog} onOpenChange={setShowFeeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Taxa de Entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deliveryFee">Nova taxa de entrega</Label>
              <CurrencyInput
                id="deliveryFee"
                value={newDeliveryFee}
                onChange={(v) => setNewDeliveryFee(String(v))}
                placeholder="0,00"
                data-testid="input-delivery-fee"
              />
            </div>
            {order.originalDeliveryFee !== null && order.originalDeliveryFee !== undefined && (
              <p className="text-sm text-muted-foreground">
                Taxa original: {formatCurrency(order.originalDeliveryFee)}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Novo total: {formatCurrency(
                Number(order.subtotal) - Number(order.discount || 0) + Number(newDeliveryFee || 0)
              )}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowFeeDialog(false)}
              data-testid="button-cancel-fee"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (onEditDeliveryFee) {
                  onEditDeliveryFee(order.id, parseFloat(newDeliveryFee) || 0);
                  setShowFeeDialog(false);
                }
              }}
              disabled={isEditingDeliveryFee}
              data-testid="button-save-fee"
            >
              {isEditingDeliveryFee ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
