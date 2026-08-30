import { useState, useMemo } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Sandwich, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  ComboWizardEmptyState,
  ComboWizardOptionCard,
  ComboWizardSectionTitle,
  ComboWizardShell,
  ComboWizardSummary,
} from '@/components/home/ComboWizardLayout';
import type { Product } from '@/shared/schema';

interface HamburgerComboModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem?: (product: Product) => void;
}

const DISCOUNT_PERCENT = 10;

export function HamburgerComboModal({ open, onOpenChange, onAddItem }: HamburgerComboModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addItemFn = onAddItem || cart?.addItem;
  
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedHamburger, setSelectedHamburger] = useState<Product | null>(null);
  const [selectedRefri, setSelectedRefri] = useState<Product | null>(null);

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const isLoading = productsLoading || categoriesLoading;

  const hamburgueres = useMemo(() => {
    const cat = categories.find(c => c.name?.toUpperCase() === 'HAMBÚRGUERES');
    if (!cat) return [];
    return products.filter(p => p.isActive && p.stock > 0 && p.categoryId === cat.id);
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

  const original = (selectedHamburger ? Number(selectedHamburger.salePrice) : 0) + (selectedRefri ? Number(selectedRefri.salePrice) : 0);
  const discounted = original * (1 - DISCOUNT_PERCENT / 100);

  const handleAddCombo = () => {
    if (!selectedHamburger || !selectedRefri) return;
    const comboProduct: Product = {
      id: `combo-hamburger-${Date.now()}`,
      name: `Combo: ${selectedHamburger.name} + ${selectedRefri.name}`,
      salePrice: String(discounted.toFixed(2)),
      costPrice: String(Number(selectedHamburger.costPrice || 0) + Number(selectedRefri.costPrice || 0)),
      categoryId: selectedHamburger.categoryId,
      isActive: true, isPrepared: false, stock: 999,
      description: `Combo ${DISCOUNT_PERCENT}% OFF`,
      imageUrl: selectedHamburger.imageUrl,
      comboEligible: false, sortOrder: 0, productType: 'combo', profitMargin: '0',
      createdAt: new Date().toISOString(),
    };
    addItemFn?.(comboProduct);
    toast({ title: 'Combo adicionado!', description: `${DISCOUNT_PERCENT}% OFF — R$ ${discounted.toFixed(2)}` });
    reset();
    onOpenChange(false);
  };

  const reset = () => { setStep(1); setSelectedHamburger(null); setSelectedRefri(null); };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <ComboWizardShell
        description="Escolha 1 hambúrguer e 1 refrigerante em lata com modal compacto e estável."
        discountPercent={DISCOUNT_PERCENT}
        footer={
          <div className="space-y-2">
            {(selectedHamburger || selectedRefri) && (
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
                {selectedHamburger && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">🍔 {selectedHamburger.name}</span>
                    <span className="shrink-0 text-muted-foreground">R$ {Number(selectedHamburger.salePrice).toFixed(2)}</span>
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
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={() => setStep(2)} disabled={!selectedHamburger}>
                  Próximo <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={handleAddCombo} disabled={!selectedHamburger || !selectedRefri}>
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  Adicionar — R$ {discounted.toFixed(2)}
                </Button>
              )}
            </div>
          </div>
        }
        icon={<Sandwich className="h-5 w-5" />}
        step={step}
        stepLabels={['Hambúrguer', 'Refrigerante']}
        title="Hambúrguer + Refri"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-3">
            <ComboWizardSectionTitle icon={<Sandwich className="h-4 w-4 text-primary" />}>
              Escolha o Hambúrguer
            </ComboWizardSectionTitle>

            {hamburgueres.length === 0 ? (
              <ComboWizardEmptyState>Nenhum hambúrguer disponível.</ComboWizardEmptyState>
            ) : (
              <div className="space-y-2">
                {hamburgueres.map((p) => (
                  <ComboWizardOptionCard
                    key={p.id}
                    onSelect={() => setSelectedHamburger(selectedHamburger?.id === p.id ? null : p)}
                    selected={selectedHamburger?.id === p.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight">{p.name}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          R$ {Number(p.salePrice).toFixed(2)}
                        </span>
                        {selectedHamburger?.id === p.id ? <Check className="h-4 w-4 text-primary" /> : null}
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
