import { useState, useEffect } from 'react';
import { Lock, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';

export type OperationPin = 'excluir_pedido' | 'editar_pedido' | 'ver_caixa' | 'registrar_fiado';

interface Props {
  open: boolean;
  operation: OperationPin;
  title: string;
  description?: string;
  targetId?: string | null;
  onValidated: () => void;
  onCancel: () => void;
}

export function OperationPinModal({ open, operation, title, description, targetId, onValidated, onCancel }: Props) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { if (open) setPin(''); }, [open]);

  const handleConfirm = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-operation-pin', {
        body: { operation, pin, targetId: targetId ?? null },
      });
      if (error) throw error;
      if (!data?.success) {
        toast({ title: 'PIN incorreto', variant: 'destructive' });
        setPin('');
        return;
      }
      onValidated();
    } catch (err: any) {
      toast({ title: 'Erro ao validar PIN', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" /> {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              autoFocus
              type="password"
              inputMode="numeric"
              placeholder="••••"
              value={pin}
              maxLength={4}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="pl-10 text-center text-2xl tracking-[0.6em]"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>Cancelar</Button>
            <Button className="flex-1" onClick={handleConfirm} disabled={pin.length !== 4 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
