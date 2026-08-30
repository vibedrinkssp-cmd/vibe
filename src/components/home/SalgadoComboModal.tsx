import { useState, useMemo } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Cookie, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  ComboWizardEmptyState,
  ComboWizardOptionCard,
  ComboWizardSectionTitle,
  ComboWizardShell,
  ComboWizardSummary,
} from '@/components/home/ComboWizardLayout';
import type { Product } from '@/shared/schema';

interface SalgadoComboModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem?: (product: Product) => void;
  onAddComboComponents?: (parts: Array<{ product: Product; quantity: number; unitPrice: number }>, comboLabel: string) => void;
}

const DISCOUNT_PERCENT = 10;
const DISCOUNT_FACTOR = 1 - DISCOUNT_PERCENT / 100;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

export function SalgadoComboModal({ open, onOpenChange, onAddItem, onAddComboComponents }: SalgadoComboModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addItemFn = onAddItem || cart?.addItem;
  
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedSalgado, setSelectedSalgado] = useState<Product | null>(null);
  const [selectedRefri, setSelectedRefri] = useState<Product | null>(null);

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const isLoading = productsLoading || categoriesLoading;

  const salgados = useMemo(() => {
    const salgadoCatIds = categories
      .filter(c => ['SALGADO', 'SALGADOS'].includes(normalizeText(c.name || '')))
      .map(c => c.id);
    return products.filter(p =>
      p.isActive &&
      p.stock > 0 &&
      (salgadoCatIds.includes(p.categoryId || '') || normalizeText(p.productType || '') === 'SALGADO')
    );
  }, [products, categories]);

  const refrisLata = useMemo(() => {
    const names = ['REFRIGERANTES'];
    const cats = categories.filter(c => names.includes(c.name?.toUpperCase() || ''));
    return products.filter(p => {
      const productName = p.name.toLowerCase();
      return (
        p.isActive &&
        p.stock > 0 &&
        cats.some(c => c.id === p.categoryId) &&
        (productName.includes('lata') || productName.includes('350ml') || productName.includes('350 ml'))
      );
    });
  }, [products, categories]);

  const original = (selectedSalgado ? Number(selectedSalgado.salePrice) : 0) + (selectedRefri ? Number(selectedRefri.salePrice) : 0);
  const discounted = original * (1 - DISCOUNT_PERCENT / 100);

  const handleAddCombo = () => {
    if (!selectedSalgado || !selectedRefri) return;
    const comboLabel = `Combo Salgado: ${selectedSalgado.name} + ${selectedRefri.name}`;

    if (onAddComboComponents) {
      onAddComboComponents([
        { product: selectedSalgado, quantity: 1, unitPrice: Number(selectedSalgado.salePrice) * DISCOUNT_FACTOR },
        { product: selectedRefri, quantity: 1, unitPrice: Number(selectedRefri.salePrice) * DISCOUNT_FACTOR },
      ], comboLabel);
    } else if (onAddItem) {
      const comboProduct: Product = {
        id: `combo-salgado-${Date.now()}`,
        name: comboLabel,
        salePrice: String(discounted.toFixed(2)),
        costPrice: String(Number(selectedSalgado.costPrice || 0) + Number(selectedRefri.costPrice || 0)),
        categoryId: selectedSalgado.categoryId,
        isActive: true, isPrepared: true, stock: 999,
        description: `Combo ${DISCOUNT_PERCENT}% OFF`,
        imageUrl: selectedSalgado.imageUrl,
        comboEligible: false, sortOrder: 0, productType: 'combo', profitMargin: '0',
        createdAt: new Date().toISOString(),
      };
      addItemFn?.(comboProduct);
    } else {
      cart?.addCombo({
        id: `combo-salgado-${Date.now()}`,
        destilado: selectedSalgado,
        energetico: selectedRefri,
        energeticoQuantity: 1,
        gelos: [],
        originalTotal: original,
        discountedTotal: discounted,
        discount: original - discounted,
        discountPercent: DISCOUNT_PERCENT,
      });
    }
    toast({ title: 'Combo adicionado!', description: `${DISCOUNT_PERCENT}% OFF — R$ ${discounted.toFixed(2)}` });
    reset();
    onOpenChange(false);
  };

  const reset = () => { setStep(1); setSelectedSalgado(null); setSelectedRefri(null); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <ComboWizardShell
        description="Escolha 1 salgado e 1 refrigerante em lata sem estourar o layout do modal."
        discountPercent={DISCOUNT_PERCENT}
        footer={
          <div className="space-y-2">
            {(selectedSalgado || selectedRefri) && (
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
                {selectedSalgado && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">🥟 {selectedSalgado.name}</span>
                    <span className="shrink-0 text-muted-foreground">R$ {Number(selectedSalgado.salePrice).toFixed(2)}</span>
                  </div>
                )}
                {selectedRefri && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">🥤 {selectedRefri.name}</span>
                    <span className="shrink-0 text-muted-foreground">R$ {Number(selectedRefri.salePrice).toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-border pt-1 mt-1 space-y-0.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="line-through text-muted-foreground">R$ {original.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Desconto {DISCOUNT_PERCENT}%</span>
                    <span className="text-green-600 font-medium">-R$ {(original - discounted).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total</span>
                    <span className="text-primary">R$ {discounted.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {step > 1 ? (
                <Button variant="outline" size="sm" onClick={() => setStep(1)} className="gap-1.5 text-xs sm:text-sm">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Button>
              ) : null}
              {step === 1 ? (
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={() => setStep(2)} disabled={!selectedSalgado}>
                  Próximo <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={handleAddCombo} disabled={!selectedSalgado || !selectedRefri}>
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  Adicionar — R$ {discounted.toFixed(2)}
                </Button>
              )}
            </div>
          </div>
        }
        icon={<Cookie className="h-5 w-5" />}
        step={step}
        stepLabels={['Salgado', 'Refrigerante']}
        title="Salgado + Refri"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-3">
            <ComboWizardSectionTitle icon={<Cookie className="h-4 w-4 text-primary" />}>
              Escolha o Salgado
            </ComboWizardSectionTitle>

            {salgados.length === 0 ? (
              <ComboWizardEmptyState>Nenhum salgado disponível.</ComboWizardEmptyState>
            ) : (
              <div className="space-y-2">
                {salgados.map((p) => (
                  <ComboWizardOptionCard
                    key={p.id}
                    onSelect={() => setSelectedSalgado(selectedSalgado?.id === p.id ? null : p)}
                    selected={selectedSalgado?.id === p.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight">{p.name}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          R$ {Number(p.salePrice).toFixed(2)}
                        </span>
                        {selectedSalgado?.id === p.id ? <Check className="h-4 w-4 text-primary" /> : null}
                      </div>
                    </div>
                  </ComboWizardOptionCard>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <ComboWizardSectionTitle>Escolha o Refrigerante</ComboWizardSectionTitle>

            {refrisLata.length === 0 ? (
              <ComboWizardEmptyState>Nenhum refrigerante disponível.</ComboWizardEmptyState>
            ) : (
              <div className="space-y-2">
                {refrisLata.map((p) => (
                  <ComboWizardOptionCard
                    key={p.id}
                    onSelect={() => setSelectedRefri(selectedRefri?.id === p.id ? null : p)}
                    selected={selectedRefri?.id === p.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight">{p.name}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          R$ {Number(p.salePrice).toFixed(2)}
                        </span>
                        {selectedRefri?.id === p.id ? <Check className="h-4 w-4 text-primary" /> : null}
                      </div>
                    </div>
                  </ComboWizardOptionCard>
                ))}
              </div>
            )}

          </div>
        )}
      </ComboWizardShell>
    </Dialog>
  );
}
