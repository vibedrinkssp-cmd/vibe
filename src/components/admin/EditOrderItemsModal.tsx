import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Plus, Minus, Search, AlertTriangle, Save, X, Loader2 } from 'lucide-react';
import { useAdminProducts } from '@/pages/admin/use-admin-data';
import { normalizeSearch } from '@/lib/text-utils';
import { formatCurrency } from '@/pages/admin/shared';
import type { OrderWithDetails } from '@/pages/admin/shared';
import type { OrderItem, Product } from '@/shared/schema';

type DraftItem = {
  // existente: id presente; novo: id null + tempKey
  id: string | null;
  tempKey: string;
  originalQuantity?: number;
  originalUnitPrice?: number;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  isWizardItem: boolean;
  removed?: boolean;
  isNew?: boolean;
};

type Change =
  | { op: 'delete'; item_id: string }
  | { op: 'update'; item_id: string; product_name: string; quantity: number; unit_price: number }
  | { op: 'add'; product_id: string | null; product_name: string; quantity: number; unit_price: number };

interface Props {
  order: OrderWithDetails | null;
  items: OrderItem[];
  onClose: () => void;
  onSave: (orderId: string, changes: Change[]) => Promise<void>;
  isSaving?: boolean;
}

export function EditOrderItemsModal({ order, items, onClose, onSave, isSaving }: Props) {
  const { data: products = [] } = useAdminProducts();
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!order) return;
    setDraft(
      items.map((it, idx) => ({
        id: it.id,
        tempKey: it.id || `existing-${idx}`,
        originalQuantity: it.quantity,
        originalUnitPrice: Number(it.unitPrice),
        productId: it.productId || null,
        productName: it.productName,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        isWizardItem: !!(it as any).isWizardItem,
        removed: false,
        isNew: false,
      })),
    );
    setSearch('');
  }, [order?.id, items]);

  const visibleDraft = draft.filter((d) => !d.removed);

  const newSubtotal = useMemo(
    () => visibleDraft.reduce((sum, d) => sum + d.quantity * d.unitPrice, 0),
    [visibleDraft],
  );
  const deliveryFee = Number(order?.deliveryFee ?? 0);
  const discount = Number(order?.discount ?? 0);
  const newTotal = Math.max(0, newSubtotal + deliveryFee - discount);
  const oldTotal = Number(order?.total ?? 0);
  const diff = newTotal - oldTotal;

  const filteredProducts = useMemo(() => {
    const term = normalizeSearch(search.trim());
    if (!term) return [] as Product[];
    return products
      .filter((p) => p.isActive !== false)
      .filter((p) => {
        const hay = `${p.name} ${p.description || ''}`;
        return normalizeSearch(hay).includes(term);
      })
      .slice(0, 12);
  }, [products, search]);

  function updateQty(tempKey: string, delta: number) {
    setDraft((d) =>
      d.map((it) =>
        it.tempKey === tempKey ? { ...it, quantity: Math.max(1, it.quantity + delta) } : it,
      ),
    );
  }

  function setQty(tempKey: string, qty: number) {
    setDraft((d) =>
      d.map((it) => (it.tempKey === tempKey ? { ...it, quantity: Math.max(1, qty) } : it)),
    );
  }

  function setPrice(tempKey: string, price: number) {
    setDraft((d) =>
      d.map((it) => (it.tempKey === tempKey ? { ...it, unitPrice: Math.max(0, price) } : it)),
    );
  }

  function removeItem(tempKey: string) {
    setDraft((d) =>
      d
        .map((it) => {
          if (it.tempKey !== tempKey) return it;
          if (it.isNew) return null as any; // descarta novos não salvos
          return { ...it, removed: true };
        })
        .filter(Boolean) as DraftItem[],
    );
  }

  function addProduct(p: Product) {
    setDraft((d) => [
      ...d,
      {
        id: null,
        tempKey: `new-${Date.now()}-${Math.random()}`,
        productId: p.id,
        productName: (p.name || '').toUpperCase(),
        quantity: 1,
        unitPrice: Number(p.salePrice ?? 0),
        isWizardItem: false,
        isNew: true,
      },
    ]);
    setSearch('');
  }

  function buildChanges(): Change[] {
    const changes: Change[] = [];
    for (const it of draft) {
      if (it.isNew && !it.removed) {
        changes.push({
          op: 'add',
          product_id: it.productId,
          product_name: it.productName,
          quantity: it.quantity,
          unit_price: it.unitPrice,
        });
      } else if (it.id && it.removed) {
        changes.push({ op: 'delete', item_id: it.id });
      } else if (it.id && !it.removed) {
        const qtyChanged = it.quantity !== it.originalQuantity;
        const priceChanged = Math.abs(it.unitPrice - (it.originalUnitPrice ?? 0)) > 0.001;
        if (qtyChanged || priceChanged) {
          changes.push({
            op: 'update',
            item_id: it.id,
            product_name: it.productName,
            quantity: it.quantity,
            unit_price: it.unitPrice,
          });
        }
      }
    }
    return changes;
  }

  async function handleSave() {
    if (!order) return;
    const changes = buildChanges();
    if (changes.length === 0) {
      onClose();
      return;
    }
    const ok = window.confirm(
      `O total mudará de ${formatCurrency(oldTotal)} para ${formatCurrency(newTotal)}.\n\n` +
        `${changes.length} alteração(ões) serão aplicadas. Confirmar?`,
    );
    if (!ok) return;
    await onSave(order.id, changes);
  }

  if (!order) return null;
  const changesCount = buildChanges().length;

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>Editar Itens do Pedido</span>
            <Badge variant="outline" className="text-xs">
              #{order.id.slice(0, 8)}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {order.customerName || 'Sem nome'} · Total atual: {formatCurrency(oldTotal)}
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Lista de itens */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Itens do pedido</h3>
              {visibleDraft.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Nenhum item — adicione abaixo.</p>
              )}
              {visibleDraft.map((it) => (
                <div
                  key={it.tempKey}
                  className={`rounded-lg border p-3 ${
                    it.isWizardItem
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : it.isNew
                        ? 'border-green-500/40 bg-green-500/5'
                        : 'border-border bg-card'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{it.productName}</div>
                      {it.isWizardItem && (
                        <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Bebida montada — não editável (cancele e refaça o pedido)
                        </div>
                      )}
                      {it.isNew && (
                        <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px] mt-1">
                          NOVO
                        </Badge>
                      )}
                    </div>
                    {!it.isWizardItem && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => removeItem(it.tempKey)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {!it.isWizardItem && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Qtd</label>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => updateQty(it.tempKey, -1)}
                            disabled={it.quantity <= 1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => setQty(it.tempKey, parseInt(e.target.value || '1', 10))}
                            className="h-8 text-center px-1"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0"
                            onClick={() => updateQty(it.tempKey, 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Preço un.</label>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={it.unitPrice}
                          onChange={(e) => setPrice(it.tempKey, parseFloat(e.target.value || '0'))}
                          className="h-8"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase">Subtotal</label>
                        <div className="h-8 flex items-center font-semibold text-primary">
                          {formatCurrency(it.quantity * it.unitPrice)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Adicionar produto */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">Adicionar produto</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, descrição ou categoria..."
                  className="pl-9"
                />
              </div>
              {filteredProducts.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Estoque: {p.stock ?? 0}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        {formatCurrency(Number(p.salePrice ?? 0))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Resumo */}
        <div className="border-t border-border p-4 bg-muted/30 space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal:</span>
            <span>{formatCurrency(newSubtotal)}</span>
          </div>
          {deliveryFee > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Taxa de entrega:</span>
              <span>{formatCurrency(deliveryFee)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Desconto:</span>
              <span>- {formatCurrency(discount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
            <span>Novo total:</span>
            <span className="text-primary">{formatCurrency(newTotal)}</span>
          </div>
          {Math.abs(diff) > 0.001 && (
            <div
              className={`flex justify-between text-xs font-semibold ${
                diff > 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              <span>Diferença vs. original:</span>
              <span>
                {diff > 0 ? '+' : ''}
                {formatCurrency(diff)}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            <X className="h-4 w-4 mr-1" />
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || changesCount === 0}
            className="bg-primary"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Salvar {changesCount > 0 ? `(${changesCount})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
