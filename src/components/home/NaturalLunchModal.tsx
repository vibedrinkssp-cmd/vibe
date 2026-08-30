import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProducts, useCategories } from '@/hooks/use-supabase-data';
import { useCartOptional } from '@/lib/cart';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShoppingCart, Leaf, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  ComboWizardEmptyState,
  ComboWizardFilterButton,
  ComboWizardOptionCard,
  ComboWizardSectionTitle,
  ComboWizardShell,
  ComboWizardSummary,
} from '@/components/home/ComboWizardLayout';
import type { Product } from '@/shared/schema';

interface NaturalLunchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddItem?: (product: Product) => void;
}

const DISCOUNT_PERCENT = 10;
type BebidaType = 'suco_natural';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const isRefriLata = (name: string) => {
  const normalized = normalizeText(name);
  return normalized.includes('lata') || normalized.includes('350ml') || normalized.includes('350 ml');
};

export function NaturalLunchModal({ open, onOpenChange, onAddItem }: NaturalLunchModalProps) {
  const cart = useCartOptional();
  const { toast } = useToast();
  const addItemFn = onAddItem || cart?.addItem;

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLanche, setSelectedLanche] = useState<Product | null>(null);
  const [selectedBebida, setSelectedBebida] = useState<Product | null>(null);
  const [bebidaType, setBebidaType] = useState<BebidaType>('suco_natural');

  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const isLoading = productsLoading || categoriesLoading;

  const lanchesNaturais = useMemo(() => {
    const lancheCategories = categories.filter(c => normalizeText(c.name || '') === 'lanches');
    return products.filter(
      p =>
        p.isActive &&
        p.stock > 0 &&
        lancheCategories.some(c => c.id === p.categoryId) &&
        normalizeText(p.name).includes('natural')
    );
  }, [products, categories]);

  const refrisLata = useMemo(() => {
    const refriCategories = categories.filter(c => normalizeText(c.name || '') === 'refrigerantes');
    return products.filter(
      p =>
        p.isActive &&
        p.stock > 0 &&
        refriCategories.some(c => c.id === p.categoryId) &&
        isRefriLata(p.name)
    );
  }, [products, categories]);

  const sucos = useMemo(() => {
    const sucoCategories = categories.filter(c => normalizeText(c.name || '') === 'sucos');
    return products.filter(
      p => p.isActive && p.stock > 0 && sucoCategories.some(c => c.id === p.categoryId)
    );
  }, [products, categories]);

  const acais = useMemo(
    () => products.filter(p => p.isActive && p.stock > 0 && normalizeText(p.name).includes('acai')),
    [products]
  );

  const sucosNaturais = useMemo(() => {
    const sucoNaturalCategories = categories.filter(c => normalizeText(c.name || '') === 'sucos naturais');
    return products.filter(
      p => p.isActive && p.stock > 0 && sucoNaturalCategories.some(c => c.id === p.categoryId)
    );
  }, [products, categories]);

  const bebidaGroups = useMemo(
    () => [
      { key: 'suco_natural' as const, label: '🍊 Suco Natural', emoji: '🍊', items: sucosNaturais },
    ].filter(group => group.items.length > 0),
    [sucosNaturais]
  );

  useEffect(() => {
    if (!bebidaGroups.length) return;
    if (!bebidaGroups.some(group => group.key === bebidaType)) {
      setBebidaType(bebidaGroups[0].key);
      setSelectedBebida(null);
    }
  }, [bebidaGroups, bebidaType]);

  const selectedGroup = bebidaGroups.find(group => group.key === bebidaType) ?? null;
  const bebidas = selectedGroup?.items ?? [];

  const original = (selectedLanche ? Number(selectedLanche.salePrice) : 0) + (selectedBebida ? Number(selectedBebida.salePrice) : 0);
  const discounted = original * (1 - DISCOUNT_PERCENT / 100);

  const handleAddCombo = () => {
    if (!selectedLanche || !selectedBebida) return;

    const comboProduct: Product = {
      id: `combo-natural-${Date.now()}`,
      name: `Combo: ${selectedLanche.name} + ${selectedBebida.name}`,
      salePrice: String(discounted.toFixed(2)),
      costPrice: String(Number(selectedLanche.costPrice || 0) + Number(selectedBebida.costPrice || 0)),
      categoryId: selectedLanche.categoryId,
      isActive: true,
      isPrepared: true,
      stock: 999,
      description: `Combo ${DISCOUNT_PERCENT}% OFF`,
      imageUrl: selectedLanche.imageUrl,
      comboEligible: false,
      sortOrder: 0,
      productType: 'combo',
      profitMargin: '0',
      createdAt: new Date().toISOString(),
    };

    addItemFn?.(comboProduct);
    toast({ title: 'Combo adicionado!', description: `${DISCOUNT_PERCENT}% OFF — R$ ${discounted.toFixed(2)}` });
    reset();
    onOpenChange(false);
  };

  const reset = () => {
    setStep(1);
    setSelectedLanche(null);
    setSelectedBebida(null);
    setBebidaType('suco_natural');
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) reset(); onOpenChange(value); }}>
      <ComboWizardShell
        description="Escolha 1 lanche natural e 1 bebida com layout compacto e rolagem estável."
        discountPercent={DISCOUNT_PERCENT}
        footer={
          <div className="space-y-2">
            {/* Price summary - shows whenever at least one item is selected */}
            {(selectedLanche || selectedBebida) && (
              <div className="rounded-lg border border-border bg-muted/30 p-2.5 space-y-1">
                {selectedLanche && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">🥪 {selectedLanche.name}</span>
                    <span className="shrink-0 text-muted-foreground">R$ {Number(selectedLanche.salePrice).toFixed(2)}</span>
                  </div>
                )}
                {selectedBebida && (
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground truncate mr-2">🍊 {selectedBebida.name}</span>
                    <span className="shrink-0 text-muted-foreground">R$ {Number(selectedBebida.salePrice).toFixed(2)}</span>
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
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={() => setStep(2)} disabled={!selectedLanche}>
                  Próximo <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button size="sm" className="min-w-0 flex-1 text-xs sm:text-sm" onClick={handleAddCombo} disabled={!selectedLanche || !selectedBebida}>
                  <ShoppingCart className="mr-1 h-4 w-4" />
                  Adicionar — R$ {discounted.toFixed(2)}
                </Button>
              )}
            </div>
          </div>
        }
        icon={<Leaf className="h-5 w-5" />}
        step={step}
        stepLabels={['Lanche', 'Bebida']}
        title="Combo Natural"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-14">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : step === 1 ? (
          <div className="space-y-3">
            <ComboWizardSectionTitle icon={<Leaf className="h-4 w-4 text-primary" />}>
              Escolha o Lanche Natural
            </ComboWizardSectionTitle>

            {lanchesNaturais.length === 0 ? (
              <ComboWizardEmptyState>Nenhum lanche natural disponível.</ComboWizardEmptyState>
            ) : (
              <div className="space-y-2">
                {lanchesNaturais.map((product) => (
                  <ComboWizardOptionCard
                    key={product.id}
                    onSelect={() => setSelectedLanche(selectedLanche?.id === product.id ? null : product)}
                    selected={selectedLanche?.id === product.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight">{product.name}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          R$ {Number(product.salePrice).toFixed(2)}
                        </span>
                        {selectedLanche?.id === product.id ? <Check className="h-4 w-4 text-primary" /> : null}
                      </div>
                    </div>
                  </ComboWizardOptionCard>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <ComboWizardSectionTitle>Escolha a bebida do combo</ComboWizardSectionTitle>

            <div className="grid grid-cols-2 gap-2">
              {bebidaGroups.map((group) => (
                <ComboWizardFilterButton
                  key={group.key}
                  active={bebidaType === group.key}
                  onClick={() => {
                    setBebidaType(group.key);
                    setSelectedBebida(null);
                  }}
                >
                  {group.label}
                </ComboWizardFilterButton>
              ))}
            </div>

            {bebidas.length === 0 ? (
              <ComboWizardEmptyState>Nenhuma bebida disponível.</ComboWizardEmptyState>
            ) : (
              <div className="space-y-2">
                {bebidas.map((product) => (
                  <ComboWizardOptionCard
                    key={product.id}
                    onSelect={() => setSelectedBebida(selectedBebida?.id === product.id ? null : product)}
                    selected={selectedBebida?.id === product.id}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium leading-tight">{product.name}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                          R$ {Number(product.salePrice).toFixed(2)}
                        </span>
                        {selectedBebida?.id === product.id ? <Check className="h-4 w-4 text-primary" /> : null}
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
