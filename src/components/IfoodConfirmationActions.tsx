import { useState } from 'react';
import { Copy, ExternalLink, Check, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  normalizeLocalizador,
  getLocalizador,
  confirmarIfood,
  copiarCodigo,
} from '@/lib/ifood-confirmation';

interface IfoodConfirmationActionsProps {
  /** Raw order notes containing <!--META:{...}--> */
  notes?: string | null;
  /** Visual variant — 'motoboy' uses larger buttons */
  variant?: 'admin' | 'motoboy';
  /** Optional: show the 4-digit confirmation code input (admin only) */
  showConfirmationCode?: boolean;
}

export function IfoodConfirmationActions({
  notes,
  variant = 'admin',
  showConfirmationCode = false,
}: IfoodConfirmationActionsProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState('');

  const localizador = getLocalizador(notes);

  if (!localizador) return null;

  const normalized = normalizeLocalizador(localizador);
  const isValid = normalized.length === 8;

  const handleCopy = async () => {
    if (!isValid) return;
    const ok = await copiarCodigo(localizador);
    if (ok) {
      setCopied(true);
      toast({ title: '✅ Código copiado!', description: normalized, duration: 2000 });
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleConfirm = async () => {
    if (!isValid) {
      toast({ title: 'Código inválido', variant: 'destructive' });
      return;
    }
    const ok = await confirmarIfood(localizador);
    if (ok) {
      toast({
        title: '📋 Código copiado — Cole no iFood',
        description: `Código ${normalized} copiado. Cole na página do iFood.`,
        duration: 5000,
      });
    }
  };

  const isMotoboy = variant === 'motoboy';
  const btnSize = isMotoboy ? 'lg' : 'sm';
  const codeTextSize = isMotoboy ? 'text-2xl' : 'text-lg';

  return (
    <div className="space-y-3">
      {/* Localizador display */}
      <div className="bg-secondary/60 rounded-lg p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Localizador iFood</p>
          <p className={`${codeTextSize} font-mono font-bold text-foreground tracking-widest select-all`}>
            {normalized.slice(0, 4)} {normalized.slice(4)}
          </p>
        </div>
        <Badge className={`${isValid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'} border text-xs`}>
          {isValid ? '✓ Válido' : '✗ Inválido'}
        </Badge>
      </div>

      {/* Action buttons */}
      <div className={`grid gap-2 ${isMotoboy ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <Button
          size={btnSize}
          variant="outline"
          className={`${isMotoboy ? 'py-5 text-base' : ''} ${copied ? 'border-green-500/50 text-green-400' : ''}`}
          onClick={handleCopy}
          disabled={!isValid}
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-4 w-4 mr-2" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Código
            </>
          )}
        </Button>

        <Button
          size={btnSize}
          className={`bg-red-600 hover:bg-red-700 text-white ${isMotoboy ? 'py-5 text-base font-bold' : ''}`}
          onClick={handleConfirm}
          disabled={!isValid}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Confirmar no iFood
        </Button>
      </div>

      {/* Optional 4-digit confirmation code input (admin fallback) */}
      {showConfirmationCode && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Código de confirmação (4 dígitos)</Label>
          <Input
            placeholder="0000"
            maxLength={4}
            value={confirmationCode}
            onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, ''))}
            className="font-mono text-center text-lg tracking-widest max-w-[120px]"
          />
        </div>
      )}
    </div>
  );
}
