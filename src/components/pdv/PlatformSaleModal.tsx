import { useState, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Minus, Store } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/shared/schema';
import { PLATFORM_DESCRIPTORS } from '@/lib/external-platforms';
import { parseNumeric } from '@/lib/format-utils';

const PLATFORMS = PLATFORM_DESCRIPTORS;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

interface PlatformSaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
}

interface SaleItem {
  product: Product;
  quantity: number;
}

export function PlatformSaleModal({ open, onOpenChange, products }: PlatformSaleModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<string>('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<SaleItem[]>([]);
  const [notes, setNotes] = useState('');

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    return products.filter(p =>
      searchIncludes(p.name, search)
    ).slice(0, 10);
  }, [products, search]);

  const addItem = (product: Product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearch('');
  };

  const updateQty = (productId: string, delta: number) => {
    setItems(prev => prev.map(i => {
      if (i.product.id === productId) {
        const newQty = i.quantity + delta;
        return newQty > 0 ? { ...i, quantity: newQty } : i;
      }
      return i;
    }).filter(i => i.quantity > 0));
  };

  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.product.id !== productId));
  };

  const total = items.reduce((sum, i) => sum + Number(i.product.salePrice) * i.quantity, 0);

  const createMutation = useMutation({
    mutationFn: async () => {
      // ATOMIC: all items registered in a single transaction
      const itemsPayload = items.map(item => {
        const unitPrice = parseNumeric(item.product.salePrice);
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: unitPrice,
          total_price: unitPrice * item.quantity,
        };
      });
      const { error } = await (supabase.rpc as any)('create_platform_sales_batch', {
        p_platform: platform,
        p_items: itemsPayload,
        p_notes: notes || null,
        p_salesperson: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['platform-sales'] });
      toast({ title: `✅ ${items.length} produto(s) registrado(s) na plataforma!` });
      resetForm();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: error?.message || 'Erro ao registrar venda', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setPlatform('');
    setSearch('');
    setItems([]);
    setNotes('');
  };

  const handleSubmit = () => {
    if (!platform) {
      toast({ title: 'Selecione a plataforma', variant: 'destructive' });
      return;
    }
    if (items.length === 0) {
      toast({ title: 'Adicione pelo menos um produto', variant: 'destructive' });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            Venda por Plataforma
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Platform Selection */}
          <div>
            <Label className="text-sm mb-2 block">Plataforma</Label>
            <div className="grid grid-cols-3 gap-2">
              {PLATFORMS.map(p => (
                <Button
                  key={p.id}
                  variant={platform === p.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlatform(p.id)}
                  className="text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Product Search */}
          <div>
            <Label className="text-sm mb-1 block">Adicionar Produto</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-secondary border-primary/30 text-sm"
              />
            </div>
            {filteredProducts.length > 0 && (
              <div className="mt-1 border border-border rounded-md max-h-40 overflow-y-auto bg-card">
                {filteredProducts.map(p => (
                  <button
                    key={p.id}
                    className="w-full text-left px-3 py-2 hover:bg-secondary text-sm flex justify-between items-center"
                    onClick={() => addItem(p)}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-primary font-medium ml-2">{formatCurrency(Number(p.salePrice))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items List */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm">Itens ({items.length})</Label>
              {items.map(item => (
                <div key={item.product.id} className="bg-secondary rounded-lg p-2 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{item.product.name}</p>
                    <p className="text-xs text-primary font-bold">{formatCurrency(Number(item.product.salePrice) * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.product.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQty(item.product.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(item.product.id)}>
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <Input
            placeholder="Observações (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-secondary border-primary/30 text-sm"
          />

          {/* Submit */}
          <Button
            className="w-full"
            disabled={!platform || items.length === 0 || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? 'Registrando...' : `Registrar Venda (${formatCurrency(total)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
