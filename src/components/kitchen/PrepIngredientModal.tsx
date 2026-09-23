import { useState, useMemo } from 'react';
import { normalizeSearch } from '@/lib/text-utils';
import { useQuery } from '@tanstack/react-query';
import { Wine, Package, Minus, Plus, X, ChefHat, Loader2, Search, Droplets } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client-safe';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { deductBottleDose } from '@/lib/deduct-bottle-doses';
import type { OrderItem, Product } from '@/shared/schema';

interface OpenBottle {
  id: string;
  product_id: string;
  product_name: string;
  total_ml: number;
  ml_per_dose: number;
  total_doses: number;
  remaining_doses: number;
  is_empty: boolean;
  opened_at: string;
  notes: string | null;
}

// Unified item that can be a bottle dose or a stock product
type PrepItem =
  | { type: 'bottle'; bottleId: string; name: string; remainingDoses: number; quantity: number }
  | { type: 'stock'; productId: string; name: string; stock: number; quantity: number };

interface PrepIngredientModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderItems: OrderItem[];
  allProducts: Product[];
  onConfirm: () => void;
}

export function PrepIngredientModal({
  open,
  onClose,
  orderId,
  orderItems,
  allProducts,
  onConfirm,
}: PrepIngredientModalProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState<PrepItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: bottles = [] } = useQuery({
    queryKey: ['open-bottles-prep'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_bottles');
      if (error) throw error;
      return (data || []).filter((b: OpenBottle) => !b.is_empty) as OpenBottle[];
    },
    enabled: open,
  });

  // Prepared items from the order
  const preparedItems = orderItems.filter(item => {
    const product = allProducts.find(p => p.id === item.productId);
    return product?.isPrepared === true;
  });

  // Build unified searchable list
  const searchResults = useMemo(() => {
    const q = normalizeSearch(search.trim());
    const results: Array<{ kind: 'bottle'; bottle: OpenBottle } | { kind: 'product'; product: Product }> = [];

    // Open bottles (doses)
    bottles.forEach(b => {
      if (!q || normalizeSearch(b.product_name).includes(q)) {
        results.push({ kind: 'bottle', bottle: b });
      }
    });

    // Stock products (gelo, ice, energético, cerveja, etc.)
    allProducts
      .filter(p => p.isActive && p.stock > 0 && !p.isPrepared)
      .forEach(p => {
        if (!q || normalizeSearch(p.name).includes(q)) {
          results.push({ kind: 'product', product: p });
        }
      });

    return results.slice(0, 40);
  }, [search, bottles, allProducts]);

  const addBottle = (bottle: OpenBottle) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.type === 'bottle' && i.bottleId === bottle.id);
      if (existing && existing.type === 'bottle') {
        if (existing.quantity >= bottle.remaining_doses) return prev;
        return prev.map(i =>
          i.type === 'bottle' && i.bottleId === bottle.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { type: 'bottle', bottleId: bottle.id, name: bottle.product_name, remainingDoses: bottle.remaining_doses, quantity: 1 }];
    });
  };

  const addProduct = (product: Product) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.type === 'stock' && i.productId === product.id);
      if (existing && existing.type === 'stock') {
        return prev.map(i =>
          i.type === 'stock' && i.productId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { type: 'stock', productId: product.id, name: product.name, stock: product.stock, quantity: 1 }];
    });
  };

  const adjustQuantity = (index: number, delta: number) => {
    setSelectedItems(prev => {
      const item = prev[index];
      const newQty = item.quantity + delta;
      if (newQty <= 0) return prev.filter((_, i) => i !== index);
      if (item.type === 'bottle' && newQty > item.remainingDoses) return prev;
      return prev.map((it, i) => (i === index ? { ...it, quantity: newQty } : it));
    });
  };

  const removeItem = (index: number) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      for (const item of selectedItems) {
        if (item.type === 'bottle') {
          const err = await deductBottleDose(item.bottleId, item.quantity);
          if (err) throw new Error(`Garrafa ${item.name}: ${err}`);
        } else {
          const { error } = await supabase.rpc('deduct_product_stock', {
            p_product_id: item.productId,
            p_quantity: item.quantity,
          });
          if (error) throw new Error(`Estoque ${item.name}: ${error.message}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['open-bottles-kitchen'] });
      queryClient.invalidateQueries({ queryKey: ['open-bottles-prep'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });

      if (selectedItems.length > 0) {
        toast({ title: 'Insumos deduzidos com sucesso!' });
      }
      onConfirm();
      handleClose();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao deduzir insumos', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedItems([]);
    setSearch('');
    onClose();
  };

  const totalItems = selectedItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ChefHat className="h-5 w-5 text-primary" />
            Insumos do Preparo
          </DialogTitle>
        </DialogHeader>

        {/* Prepared items summary */}
        {preparedItems.length > 0 && (
          <div className="px-4 py-2 bg-muted/30 border-b border-border">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">ITENS A PREPARAR:</p>
            <div className="flex flex-wrap gap-1">
              {preparedItems.map(item => (
                <Badge key={item.id} variant="secondary" className="text-xs font-medium">
                  {item.quantity}x {item.productName}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 pt-3 pb-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar dose, gelo, energético, cerveja, ice..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        {/* Search results */}
        <ScrollArea className="flex-1 min-h-0 px-4 py-2" style={{ maxHeight: '260px' }}>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {search ? 'Nenhum item encontrado' : 'Digite para buscar insumos'}
            </p>
          ) : (
            <div className="space-y-1">
              {searchResults.map((result, idx) => {
                if (result.kind === 'bottle') {
                  const b = result.bottle;
                  const pct = (b.remaining_doses / b.total_doses) * 100;
                  const selected = selectedItems.find(i => i.type === 'bottle' && i.bottleId === b.id);
                  return (
                    <button
                      key={`b-${b.id}`}
                      onClick={() => addBottle(b)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                        selected ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Wine className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.product_name}</p>
                        <p className={`text-xs ${pct > 50 ? 'text-green-500' : pct > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                          {b.remaining_doses} doses restantes
                        </p>
                      </div>
                      {selected && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          {selected.quantity}
                        </Badge>
                      )}
                      <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                } else {
                  const p = result.product;
                  const selected = selectedItems.find(i => i.type === 'stock' && i.productId === p.id);
                  return (
                    <button
                      key={`p-${p.id}`}
                      onClick={() => addProduct(p)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-colors ${
                        selected ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:bg-muted'
                      }`}
                    >
                      <div className="h-8 w-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                        <Package className="h-4 w-4 text-secondary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.stock} em estoque</p>
                      </div>
                      {selected && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          {selected.quantity}
                        </Badge>
                      )}
                      <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  );
                }
              })}
            </div>
          )}
        </ScrollArea>

        {/* Selected items list */}
        {selectedItems.length > 0 && (
          <>
            <Separator />
            <div className="px-4 py-2">
              <p className="text-[11px] font-medium text-muted-foreground mb-2">
                INSUMOS SELECIONADOS ({totalItems})
              </p>
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {selectedItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border border-border">
                    {item.type === 'bottle' ? (
                      <Droplets className="h-4 w-4 text-primary flex-shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm flex-1 truncate">{item.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => adjustQuantity(index, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => adjustQuantity(index, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="p-4 pt-2 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ChefHat className="h-4 w-4 mr-2" />
            )}
            {totalItems > 0 ? `Preparar (${totalItems} itens)` : 'Preparar sem insumos'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
