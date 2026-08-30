import { lazy, Suspense, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Edit2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { OperationPinModal } from '@/components/auth/OperationPinModal';
import type { Order, OrderItem } from '@/shared/schema';
import type { OrderWithDetails } from '@/pages/admin/shared';

const EditOrderItemsModal = lazy(() => import('@/components/admin/EditOrderItemsModal').then((module) => ({ default: module.EditOrderItemsModal })));

interface Props {
  order: Order & { items?: OrderItem[] };
  /** Quem está editando (KDE, LOG, ADMIN, etc.) — apenas log de auditoria */
  responsible?: string;
  className?: string;
  size?: 'sm' | 'default';
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  label?: string;
}

/**
 * Verifica se o pedido pode ser editado:
 * - status pendente/aceito/preparando/pronto
 * - não foi coletado pelo motoboy
 * - não é PIX online (Mercado Pago)
 * - não foi pago online via plataforma externa (iFood/99Food)
 */
function canEdit(order: any): boolean {
  if (!order) return false;
  const editable = ['pending', 'accepted', 'preparing', 'ready'];
  if (!editable.includes(order.status)) return false;
  if (order.mpPaymentId || order.mp_payment_id) return false;
  if (order.pickedUpAt || order.picked_up_at) return false;
  const confirmedBy = order.paymentConfirmedBy || order.payment_confirmed_by || '';
  if (typeof confirmedBy === 'string' && /\(online\)/i.test(confirmedBy)) return false;
  return true;
}

export function EditOrderItemsButton({
  order,
  responsible = 'STAFF',
  className,
  size = 'sm',
  variant = 'outline',
  label = 'Editar itens',
}: Props) {
  const [open, setOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ orderId, changes }: { orderId: string; changes: any[] }) => {
      const { data, error } = await supabase.rpc('edit_order_items', {
        p_order_id: orderId,
        p_changes: changes as any,
        p_admin: responsible,
      });
      if (error) throw error;
      return data as { success: boolean; old_total: number; new_total: number; items_changed: number };
    },
    onSuccess: (result) => {
      toast({
        title: '✏️ Pedido atualizado!',
        description: `${result.items_changed} alteração(ões). Novo total: R$ ${Number(result.new_total).toFixed(2)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin-order-items'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      setOpen(false);
    },
    onError: (err: any) => {
      toast({ title: 'Erro ao editar pedido', description: err.message, variant: 'destructive' });
    },
  });

  if (!canEdit(order)) return null;

  const items = order.items || [];

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setPinOpen(true)}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Edit2 className="h-4 w-4 mr-1" />
        )}
        {label}
      </Button>

      <OperationPinModal
        open={pinOpen}
        operation="editar_pedido"
        title="Confirmar Edição"
        description="Digite o PIN para editar este pedido."
        targetId={order.id}
        onValidated={() => { setPinOpen(false); setOpen(true); }}
        onCancel={() => setPinOpen(false)}
      />

      {open && (
        <Suspense fallback={null}>
          <EditOrderItemsModal
            order={order as OrderWithDetails}
            items={items}
            onClose={() => setOpen(false)}
            onSave={async (orderId, changes) => {
              await mutation.mutateAsync({ orderId, changes });
            }}
            isSaving={mutation.isPending}
          />
        </Suspense>
      )}
    </>
  );
}
