import { useEffect, useState } from 'react';
import { Snowflake, GlassWater, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { loadAvailableGelos, loadAvailableIces } from '@/lib/ice-products';
import type { ExtraKind } from '@/lib/copao-product';
import type { Product } from '@/shared/schema';

interface ExtraChoiceDialogProps {
  kind: ExtraKind;
  productName: string;
  onOpenChange: (open: boolean) => void;
  /** null = sem o complemento (só vale para gelo) */
  onConfirm: (extra: Product | null) => void;
}

const COPY: Record<ExtraKind, { title: string; hint: string; icon: typeof Snowflake; empty: string }> = {
  gelo: { title: 'Qual gelo?', hint: 'escolha o gelo disponível.', icon: Snowflake, empty: 'Nenhum gelo com estoque no momento.' },
  ice: { title: 'Qual Ice?', hint: 'escolha a Ice disponível.', icon: GlassWater, empty: 'Nenhuma Ice com estoque no momento.' },
};

/** Janela "qual gelo / qual Ice?" ao lançar um copão ou Caipi Ice pronto: lista só o que tem estoque. */
export function ExtraChoiceDialog({ kind, productName, onOpenChange, onConfirm }: ExtraChoiceDialogProps) {
  const [options, setOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { title, hint, icon: Icon, empty } = COPY[kind];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (kind === 'gelo' ? loadAvailableGelos() : loadAvailableIces())
      .then((list) => { if (!cancelled) setOptions(list); })
      .catch((err) => {
        console.warn('[ExtraChoiceDialog] falha ao carregar opções', err);
        if (!cancelled) setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind]);

  const choose = (extra: Product | null) => {
    onConfirm(extra);
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-blue-500" /> {title}
          </DialogTitle>
          <DialogDescription>{productName} — {hint}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o)}
                className="rounded-xl border-2 border-border p-3 text-left hover:border-primary"
                data-testid={`extra-option-${o.id}`}
              >
                <span className="block text-sm font-semibold leading-tight">{kind === 'gelo' ? o.name.replace(/^gelo\s*/i, '') : o.name}</span>
                <span className="block text-[11px] text-muted-foreground">{o.stock} em estoque</span>
              </button>
            ))}
            {(failed || options.length === 0) && (
              <p className="col-span-2 text-sm text-muted-foreground text-center py-2">
                {failed ? 'Não foi possível carregar as opções.' : empty}
              </p>
            )}
          </div>
        )}

        {kind === 'gelo' && (
          <Button variant="outline" onClick={() => choose(null)} data-testid="extra-sem-gelo">
            Sem gelo
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
