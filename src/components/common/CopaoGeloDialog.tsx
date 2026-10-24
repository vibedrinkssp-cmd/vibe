import { useEffect, useState } from 'react';
import { Snowflake, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client-safe';
import { listAvailableIceFlavors } from '@/lib/ice-flavor-icons';
import type { Product } from '@/shared/schema';

interface CopaoGeloDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copaoName: string;
  /** null = copão sem gelo */
  onConfirm: (gelo: Product | null) => void;
}

function toProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    salePrice: String(row.sale_price || 0),
    costPrice: '0',
    profitMargin: '0',
    stock: row.stock ?? 0,
    categoryId: row.category_id ?? null,
    isActive: row.is_active ?? true,
    sortOrder: row.sort_order ?? 0,
    isPrepared: false,
  };
}

/** Janela "qual gelo?" ao lançar um copão pronto: lista só os gelos com estoque. */
export function CopaoGeloDialog({ open, onOpenChange, copaoName, onConfirm }: CopaoGeloDialogProps) {
  const [gelos, setGelos] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const { data: cats } = await supabase.from('categories_public').select('id').ilike('name', '%gelo%');
        const catIds = (cats || []).map((c) => c.id).filter((id): id is string => !!id);
        const { data: rows, error } = catIds.length
          ? await supabase
              .from('products_public')
              .select('id, name, image_url, sale_price, stock, category_id, is_active, sort_order')
              .in('category_id', catIds)
              .eq('is_active', true)
          : { data: [], error: null };
        if (error) throw error;
        if (!cancelled) setGelos(listAvailableIceFlavors(rows || []).map(toProduct));
      } catch (err) {
        console.warn('[CopaoGeloDialog] falha ao carregar gelos', err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const choose = (gelo: Product | null) => {
    onConfirm(gelo);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-blue-500" /> Qual gelo?
          </DialogTitle>
          <DialogDescription>{copaoName} — escolha o gelo disponível.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
            {gelos.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => choose(g)}
                className="rounded-xl border-2 border-border p-3 text-left hover:border-primary"
                data-testid={`copao-gelo-${g.id}`}
              >
                <span className="block text-sm font-semibold leading-tight">{g.name.replace(/^gelo\s*/i, '')}</span>
                <span className="block text-[11px] text-muted-foreground">{g.stock} em estoque</span>
              </button>
            ))}
            {(failed || gelos.length === 0) && (
              <p className="col-span-2 text-sm text-muted-foreground text-center py-2">
                {failed ? 'Não foi possível carregar os gelos.' : 'Nenhum gelo com estoque no momento.'}
              </p>
            )}
          </div>
        )}

        <Button variant="outline" onClick={() => choose(null)} data-testid="copao-sem-gelo">
          Sem gelo
        </Button>
      </DialogContent>
    </Dialog>
  );
}
