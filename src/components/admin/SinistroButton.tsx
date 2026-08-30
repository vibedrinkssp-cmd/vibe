// SINISTRO — botão vermelho que permite forçar o status de qualquer pedido
// (mesmo cancelado/entregue) para qualquer outro status.
// Casos de uso: cliente cancelou e quer voltar; pedido marcado entregue por engano;
// reversão para realocar motoboy sem precisar de novo pedido / estorno PIX.
import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSinistroRevertStatus } from '@/pages/admin/use-admin-data';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '⏳ Pendente' },
  { value: 'accepted', label: '✅ Aceito' },
  { value: 'preparing', label: '👨‍🍳 Em Produção' },
  { value: 'ready', label: '📦 Pronto' },
  { value: 'dispatched', label: '🛵 Despachado' },
  { value: 'delivered', label: '🏁 Entregue' },
  { value: 'cancelled', label: '❌ Cancelado' },
];

interface SinistroButtonProps {
  orderId: string;
  currentStatus: string;
  orderCode?: string;
}

export function SinistroButton({ orderId, currentStatus, orderCode }: SinistroButtonProps) {
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('accepted');
  const [reason, setReason] = useState<string>('');
  const sinistroMutation = useSinistroRevertStatus();

  const handleConfirm = async () => {
    if (!newStatus) return;
    try {
      await sinistroMutation.mutateAsync({
        orderId,
        newStatus,
        reason: reason.trim() || undefined,
      });
      setOpen(false);
      setReason('');
    } catch {
      // toast já tratado no hook
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-red-700 hover:bg-red-800 text-white font-black border border-red-900 shadow-lg shadow-red-900/40"
        data-testid={`btn-sinistro-${orderId}`}
      >
        <AlertTriangle className="w-4 h-4 mr-1" />
        SINISTRO
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="border-red-900/50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              SINISTRO — Reversão Forçada de Status
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Esta operação <strong className="text-red-400">força</strong> o status
                do pedido {orderCode ? <code className="text-foreground">#{orderCode}</code> : 'selecionado'},
                mesmo que ele esteja <strong>cancelado</strong> ou <strong>entregue</strong>.
              </span>
              <span className="block text-xs text-muted-foreground">
                Status atual: <strong className="text-foreground">{currentStatus}</strong>.
                Ao retornar para etapas anteriores ao despacho, o motoboy é desvinculado
                automaticamente para nova alocação.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sinistro-new-status">Novo status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="sinistro-new-status" data-testid="select-sinistro-status">
                  <SelectValue placeholder="Selecione o novo status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value === currentStatus}
                    >
                      {opt.label}
                      {opt.value === currentStatus ? ' (atual)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sinistro-reason">Motivo (recomendado)</Label>
              <Textarea
                id="sinistro-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: Cliente cancelou e voltou atrás — vamos reenviar para entrega."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Registrado na auditoria do sistema.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={sinistroMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={sinistroMutation.isPending || newStatus === currentStatus}
              className="bg-red-700 hover:bg-red-800 text-white font-black"
            >
              {sinistroMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  CONFIRMAR SINISTRO
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
