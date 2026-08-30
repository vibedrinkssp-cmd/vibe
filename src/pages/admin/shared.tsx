// Shared utilities and types for admin dashboard
import type { Order, OrderItem, Product, Category, User, Motoboy, Address, Banner, Settings } from '@/shared/schema';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS, SALESPERSON_LABELS, getSalespersonLabel, type OrderStatus, type PaymentMethod, type OrderType, type Salesperson } from '@/shared/schema';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';

export { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS, SALESPERSON_LABELS, getSalespersonLabel };
export type { OrderStatus, PaymentMethod, OrderType, Salesperson };
export type { Order, OrderItem, Product, Category, User, Motoboy, Address, Banner, Settings };

export interface OrderWithDetails extends Order {
  items?: OrderItem[];
  userName?: string;
  userWhatsapp?: string;
  motoboy?: Motoboy;
  address?: Address;
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
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

export function StatusBadge({ status }: { status: OrderStatus }) {
  const colors: Record<OrderStatus, string> = {
    pending: 'bg-primary/20 text-primary border-primary/30',
    accepted: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    preparing: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    ready: 'bg-green-500/20 text-green-300 border-green-500/30',
    dispatched: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    arrived: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    delivered: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  
  return (
    <Badge className={`${colors[status]} border`}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

// Badge para indicar pagamento PIX confirmado
export function PixPaidBadge({ paymentMethod, status }: { paymentMethod: PaymentMethod; status: OrderStatus }) {
  // Mostra apenas para PIX quando status não é pending ou cancelled (significa que foi pago)
  if (paymentMethod !== 'pix' || status === 'pending' || status === 'cancelled') {
    return null;
  }
  
  return (
    <Badge className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      PIX Pago
    </Badge>
  );
}

// Verifica se um pedido pode ter seus itens editados manualmente pelo admin
export function canEditOrder(order: OrderWithDetails | Order | null | undefined): boolean {
  if (!order) return false;
  const editableStatuses: OrderStatus[] = ['pending', 'accepted', 'preparing', 'ready'];
  if (!editableStatuses.includes(order.status as OrderStatus)) return false;
  // PIX online (Mercado Pago) — valor fechado, não pode editar
  if ((order as any).mpPaymentId || (order as any).mp_payment_id) return false;
  // Já coletado pelo motoboy
  if ((order as any).pickedUpAt || (order as any).picked_up_at) return false;
  // Pago online via plataforma externa
  const confirmedBy = (order as any).paymentConfirmedBy || (order as any).payment_confirmed_by || '';
  if (typeof confirmedBy === 'string' && /\(online\)/i.test(confirmedBy)) return false;
  return true;
}

export const CHART_COLORS = ['#8B6215', '#A9791F', '#D4AF37', '#EAC93C', '#FDE047'];

// Cores bem distintas para gráfico de análise financeira
export const FINANCIAL_CHART_COLORS = {
  faturamento: '#3B82F6',    // Azul vibrante
  custo: '#EF4444',          // Vermelho
  lucroBruto: '#22C55E',     // Verde
  sangrias: '#F97316',       // Laranja
  lucroLiquido: '#D4AF37',   // Dourado
};
