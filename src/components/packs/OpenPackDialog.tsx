import { useEffect, useMemo, useState } from 'react';
import { Plus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { useToast } from '@/hooks/use-toast';
import { parseNumeric } from '@/lib/format-utils';
import { useAdminProducts, useAdminCategories } from '@/pages/admin/use-admin-data';

const TOBACCO_CATEGORY_RE = /TABAC|CIGARR/i;
const PACK_NAME_RE = /(^|[^A-Z])(MA[CÇ]O|MASSO)([^A-Z]|$)/;
// Itens da tabacaria que não são maço de cigarro
const NOT_A_PACK_RE = /ISQUEIRO|SEDA|PITEIRA|CARV[AÃ]O|ESS[EÊ]NCIA|ALUMINIO|FILTRO|DICHAVADOR|TABACO|TABAQUIN|AMSTERDAM|SOLTO|SOLTA|PALHEIRO|PALHA|MA[CÇ]ARICO|NARGUILE/;

/** Calcula o preço unitário sugerido a partir do produto MAÇO. */
export function suggestUnitPrice(productSalePrice: number | null | undefined, packSize: number): number {
  const sp = parseNumeric(productSalePrice);
  if (sp <= 0 || packSize <= 0) return 0;
  return Math.round((sp / packSize) * 100) / 100;
}

/** Produto só para dar nome ao maço: inativo (fora da loja) e sem estoque, nada é baixado. */
async function createHiddenPackProduct(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_product', {
    p_name: name,
    p_cost_price: 0,
    p_profit_margin: 0,
    p_sale_price: 0,
    p_stock: 0,
    p_is_active: false,
  });
  if (error || !data) throw new Error(error?.message ?? 'Não foi possível criar o produto do maço');
  return data as string;
}

interface OpenPackDialogProps {
  triggerClassName?: string;
  triggerSize?: 'default' | 'sm' | 'lg';
  /** Rótulo do botão que abre a janela. */
  triggerLabel?: string;
}

/** Botão + janela para abrir um maço (do estoque, já aberto ou de marca não cadastrada). Usado no admin e no PDV. */
export function OpenPackDialog({ triggerClassName, triggerSize, triggerLabel = 'Abrir Maço' }: OpenPackDialogProps) {
  const { data: products = [] } = useAdminProducts();
  const { data: categories = [] } = useAdminCategories();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [packSize, setPackSize] = useState<string>('20');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [openedBy, setOpenedBy] = useState('');
  // Maço que já estava aberto antes do sistema: informa quantos cigarros restam
  const [alreadyOpen, setAlreadyOpen] = useState(false);
  const [remainingUnits, setRemainingUnits] = useState('');
  // Maço de uma marca que não existe no cadastro: digita o nome e o sistema cria o produto (inativo, sem estoque)
  const [unregistered, setUnregistered] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  // Maços = produtos da tabacaria que são cigarro (o cadastro não usa "MAÇO" no nome),
  // ou qualquer produto com MAÇO/MACO/MASSO no nome.
  const cigaretteProducts = useMemo(() => {
    const tobaccoCategories = new Set(categories.filter(c => TOBACCO_CATEGORY_RE.test(c.name)).map(c => c.id));
    return products.filter(p => {
      const name = p.name.toUpperCase();
      if (PACK_NAME_RE.test(name)) return true;
      return tobaccoCategories.has(p.categoryId || '') && !NOT_A_PACK_RE.test(name);
    });
  }, [products, categories]);

  // Pré-preenche preço sugerido sempre que muda produto ou tamanho
  useEffect(() => {
    if (!selectedProductId) return;
    const prod = cigaretteProducts.find(p => p.id === selectedProductId);
    const size = parseInt(packSize, 10) || 0;
    const suggested = suggestUnitPrice(prod?.salePrice as number | null | undefined, size);
    if (suggested > 0) {
      setUnitPrice(suggested.toFixed(2).replace('.', ','));
    } else {
      setUnitPrice('');
    }
  }, [selectedProductId, packSize, cigaretteProducts]);

  const selectedProduct = cigaretteProducts.find(p => p.id === selectedProductId);
  const suggestedPrice = suggestUnitPrice(
    selectedProduct?.salePrice as number | null | undefined,
    parseInt(packSize, 10) || 0,
  );

  const openPackMutation = useMutation({
    mutationFn: async () => {
      const size = parseInt(packSize, 10);
      const price = parseFloat(unitPrice.replace(',', '.'));
      if (!size || size < 1) throw new Error('Informe a quantidade de cigarros');
      if (!price || price <= 0) throw new Error('Preço por cigarro inválido — verifique o cadastro do produto');
      if (alreadyOpen) {
        const productName = newProductName.trim().toUpperCase();
        if (unregistered && !productName) throw new Error('Digite o nome do maço');
        const remaining = parseInt(remainingUnits, 10);
        if (Number.isNaN(remaining) || remaining < 0 || remaining > size) {
          throw new Error(`Informe quantos cigarros restam (de 0 a ${size})`);
        }
        const productId = unregistered ? await createHiddenPackProduct(productName) : selectedProductId;
        const { data, error } = await supabase
          .from('open_packs')
          .insert({
            product_id: productId,
            product_name: unregistered ? productName : selectedProduct?.name ?? '',
            pack_size: size,
            remaining_units: remaining,
            unit_price: price,
            opened_by: openedBy || null,
            is_empty: remaining === 0,
            notes: 'Já aberto antes do sistema (sem baixa de estoque)',
          })
          .select('id')
          .single();
        if (error) throw error;
        return data?.id;
      }
      const { data, error } = await supabase.rpc('open_cigarette_pack', {
        p_product_id: selectedProductId,
        p_pack_size: size,
        p_unit_price: price,
        p_opened_by: openedBy || undefined,
        p_notes: undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-packs'] });
      queryClient.invalidateQueries({ queryKey: ['loose-cigarette-packs'] });
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['admin-products'] });
      toast({ title: '🚬 Maço aberto com sucesso!' });
      setOpenDialog(false);
      setSelectedProductId('');
      setUnitPrice('');
      setOpenedBy('');
      setAlreadyOpen(false);
      setRemainingUnits('');
      setUnregistered(false);
      setNewProductName('');
    },
    onError: (err: Error) => {
      toast({ title: 'Erro ao abrir maço', description: err.message, variant: 'destructive' });
    },
  });

  return (
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogTrigger asChild>
          <Button className={triggerClassName ?? 'gap-2'} size={triggerSize} type="button">
            <Plus className="h-4 w-4" />
            Abrir Maço
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Maço de Cigarro</DialogTitle>
            <DialogDescription>O preço unitário é calculado automaticamente a partir do cadastro do produto.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={alreadyOpen}
                onChange={(e) => setAlreadyOpen(e.target.checked)}
                className="mt-0.5 rounded border-primary"
              />
              <span className="text-sm">
                Maço que já estava aberto
                <span className="block text-xs text-muted-foreground">Informe quantos cigarros ainda restam nele.</span>
              </span>
            </label>
            {alreadyOpen && (
              <label className="flex items-start gap-2 p-2.5 border rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={unregistered}
                  onChange={(e) => setUnregistered(e.target.checked)}
                  className="mt-0.5 rounded border-primary"
                />
                <span className="text-sm">
                  Maço que não está cadastrado
                  <span className="block text-xs text-muted-foreground">Digite o nome. Fica só no controle de cigarro solto, sem estoque e fora da loja.</span>
                </span>
              </label>
            )}
            {alreadyOpen && unregistered ? (
            <div>
              <Label>Nome do maço</Label>
              <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Ex: MARLBORO RED MAÇO" />
            </div>
            ) : (
            <div>
              <Label>Produto (Maço)</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o maço..." />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-60">
                    {cigaretteProducts.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        Nenhum produto MAÇO encontrado.
                      </div>
                    ) : (
                      cigaretteProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} (Estoque: {p.stock} • R$ {parseNumeric(p.salePrice).toFixed(2).replace('.', ',')})
                        </SelectItem>
                      ))
                    )}
                  </ScrollArea>
                </SelectContent>
              </Select>
              {selectedProduct && parseNumeric(selectedProduct.salePrice) <= 0 && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Este produto está sem preço de venda cadastrado.
                </p>
              )}
            </div>
            )}
            <div>
              <Label>Quantidade de cigarros no maço</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                placeholder="Ex: 20"
              />
            </div>
            {alreadyOpen && (
              <div>
                <Label>Quantos cigarros restam</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={parseInt(packSize, 10) || 50}
                  value={remainingUnits}
                  onChange={(e) => setRemainingUnits(e.target.value)}
                  placeholder="Ex: 12"
                />
              </div>
            )}
            <div>
              <Label>Preço por cigarro solto (R$)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.10"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="Ex: 1,50"
              />
              {suggestedPrice > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Sugerido pelo cadastro: <span className="font-semibold text-primary">R$ {suggestedPrice.toFixed(2).replace('.', ',')}</span> ({selectedProduct?.name} ÷ {packSize})
                </p>
              )}
            </div>
            <div>
              <Label>Aberto por (opcional)</Label>
              <Input
                value={openedBy}
                onChange={(e) => setOpenedBy(e.target.value)}
                placeholder="Nome do funcionário"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => openPackMutation.mutate()}
              disabled={(alreadyOpen && unregistered ? !newProductName.trim() : !selectedProductId) || (alreadyOpen && remainingUnits === '') || openPackMutation.isPending}
            >
              {openPackMutation.isPending ? 'Abrindo...' : 'Abrir Maço'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
