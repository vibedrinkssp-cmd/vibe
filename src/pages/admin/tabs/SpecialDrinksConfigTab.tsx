import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { searchIncludes } from '@/lib/text-utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client-safe';
import { useDrinkFruits, useUpdateFruit } from '@/hooks/use-drink-fruits';
import { getFruitEmoji } from '@/lib/emoji-icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { getAdminSessionToken } from '@/lib/admin-session';
import { compressImage, formatBytes } from '@/lib/image-compression';
import { uploadImage } from '@/lib/supabase';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Wine, Zap, Snowflake, Cherry, Upload, Loader2, Save,
  ChevronDown, ChevronUp, Settings2,
  Image as ImageIcon, Palette, Ban, AlertCircle, Cookie, Package,
} from 'lucide-react';

/* ─── Constants ─── */
const MAX_IMAGE_PX = 512;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ORIGINAL_SIZE_MB = 20; // limite generoso para arquivo original

/* ─── Types ─── */
interface DrinkConfig {
  id: string;
  slug: string;
  label: string;
  image_url: string | null;
  is_enabled: boolean;
  sort_order: number;
  gradient: string;
  step_doses: boolean;
  step_energetico: boolean;
  step_gelo: boolean;
  step_frutas: boolean;
  step_ice: boolean;
  step_adicionais: boolean;
  max_doses: number;
  max_frutas: number;
  max_adicionais: number;
  fruit_price: number;
  adicional_price: number;
  allow_no_alcohol: boolean;
  base_price: number;
  no_alcohol_price: number;
}

const STEP_ICONS = {
  step_doses: { icon: Wine, label: 'Doses (Destilados)', color: 'text-amber-500' },
  step_energetico: { icon: Zap, label: 'Energético', color: 'text-green-500' },
  step_gelo: { icon: Snowflake, label: 'Gelo', color: 'text-cyan-500' },
  step_frutas: { icon: Cherry, label: 'Frutas', color: 'text-pink-500' },
  step_adicionais: { icon: Cookie, label: 'Adicionais', color: 'text-orange-500' },
  step_ice: { icon: Snowflake, label: 'Bebida Ice', color: 'text-blue-400' },
};

/* ─── Helpers ─── */

/** Validates image file before upload */
function validateImageFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Formato inválido. Use: JPG, PNG, WebP ou GIF.`;
  }
  if (file.size > MAX_ORIGINAL_SIZE_MB * 1024 * 1024) {
    return `Arquivo muito grande (${formatBytes(file.size)}). Máximo: ${MAX_ORIGINAL_SIZE_MB}MB.`;
  }
  return null;
}

/** Validates image dimensions via canvas */
function validateImageDimensions(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      if (img.naturalWidth > MAX_IMAGE_PX || img.naturalHeight > MAX_IMAGE_PX) {
        resolve(`Imagem muito grande (${img.naturalWidth}×${img.naturalHeight}). Máximo: ${MAX_IMAGE_PX}×${MAX_IMAGE_PX}px. A imagem será redimensionada automaticamente.`);
      }
      resolve(null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve('Não foi possível ler a imagem.');
    };
    img.src = URL.createObjectURL(file);
  });
}

/** Resolve image URL - handles both local assets and storage URLs */
function resolveImageUrl(url: string | null, slug: string): string {
  if (url && url.startsWith('http')) return url;
  // Default local images per slug
  const defaults: Record<string, string> = {
    batida: '/assets/drinks/batida.webp',
    caipirinha: '/assets/drinks/caipirinha.webp',
    'caipi-ice': '/assets/drinks/caipi-ice.webp',
    dose: '/assets/drinks/dose.webp',
    'drink-43': '/assets/drinks/drink-43.webp',
    copao: '/assets/drinks/copao.webp',
  };
  if (url && !url.startsWith('http')) return url; // local path like /assets/...
  return defaults[slug] || '/assets/drinks/batida.webp';
}

/* ─── Config Card Component ─── */
interface OpenBottleInfo {
  id: string;
  product_name: string;
  product_id: string;
  product_type: string | null;
  dose_price: number;
  remaining_doses: number;
}


/* ─── Allowed Bottles Selector ─── */
function AllowedBottlesSelector({ configId, openBottles, sessionToken }: { configId: string; openBottles: OpenBottleInfo[]; sessionToken: string | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const { data: allowedIds = [], isLoading } = useQuery({
    queryKey: ['allowed-products', configId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('special_drink_allowed_products' as any)
        .select('product_id')
        .eq('config_id', configId)) as any;
      if (error) throw error;
      return (data || []).map((r: any) => r.product_id as string);
    },
  });

  const allowedSet = useMemo(() => new Set(allowedIds), [allowedIds]);

  const filteredBottles = useMemo(() => {
    if (!search.trim()) return openBottles;
    return openBottles.filter(b => searchIncludes(b.product_name, search));
  }, [openBottles, search]);

  const toggleProduct = async (productId: string) => {
    if (!sessionToken) {
      toast({
        title: 'Sessão administrativa expirada',
        description: 'Faça login novamente para salvar as garrafas permitidas.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const enable = !allowedSet.has(productId);
      
      const { data, error } = await (supabase.rpc as any)('toggle_allowed_bottle', {
        p_session_token: sessionToken,
        p_config_id: configId,
        p_product_id: productId,
        p_enabled: enable,
      });

      if (error) throw error;

      const response = data as { success?: boolean; allowedProductIds?: string[]; error?: string } | null;
      if (response?.error) {
        throw new Error(response.error);
      }

      const nextAllowedIds = Array.isArray(response?.allowedProductIds)
        ? response.allowedProductIds
        : enable
          ? [...allowedIds, productId]
          : allowedIds.filter((id: string) => id !== productId);

      queryClient.setQueryData(['allowed-products', configId], nextAllowedIds);
      queryClient.invalidateQueries({ queryKey: ['allowed-products', configId] });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error?.message || 'Não foi possível atualizar as garrafas permitidas.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin mx-auto" />;

  const activeCount = openBottles.filter(b => allowedSet.has(b.product_id)).length;

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold flex items-center gap-1">
        <Package className="h-3.5 w-3.5" /> Garrafas Permitidas
      </Label>
      <p className="text-[10px] text-muted-foreground">
        {activeCount === 0
          ? '⚠️ Nenhuma garrafa habilitada — nada aparecerá nesta montagem.'
          : `🔒 ${activeCount} garrafa(s) habilitada(s).`}
      </p>
      <p className="text-[10px] text-muted-foreground italic">
        Lista todos os produtos líquidos. Mostrará no app só quando a cozinha abrir a garrafa.
      </p>

      {openBottles.length > 3 && (
        <Input
          placeholder="Buscar garrafa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs"
        />
      )}

      <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-2 bg-background space-y-0.5">
        {filteredBottles.map(b => {
          const isOpen = (b as any).is_open as boolean | undefined;
          return (
            <label key={b.id} className={`flex items-center gap-2 p-1.5 rounded cursor-pointer hover:bg-muted/50 transition-colors ${allowedSet.has(b.product_id) ? 'bg-primary/10' : ''}`}>
              <Checkbox checked={allowedSet.has(b.product_id)} onCheckedChange={() => toggleProduct(b.product_id)} disabled={saving} />
              <span className="text-xs truncate flex-1">{b.product_name}</span>
              {isOpen ? (
                <Badge className="text-[9px] h-4 px-1 bg-emerald-600">Aberta {b.remaining_doses}d</Badge>
              ) : (
                <Badge variant="outline" className="text-[9px] h-4 px-1 text-muted-foreground">Fechada</Badge>
              )}
              {allowedSet.has(b.product_id) && <Badge className="text-[9px] h-4 px-1 bg-primary">✓</Badge>}
            </label>
          );
        })}

        {filteredBottles.length === 0 && openBottles.length > 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-2">Nenhuma garrafa encontrada.</p>
        )}

        {openBottles.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum produto líquido cadastrado.</p>
        )}
      </div>
    </div>
  );
}

function ConfigCard({ config, onSave, onImageUpload, uploading, saving, openBottles, sessionToken }: {
  config: DrinkConfig;
  onSave: (updates: Partial<DrinkConfig>) => void;
  onImageUpload: (file: File) => void;
  uploading: boolean;
  saving: boolean;
  openBottles: OpenBottleInfo[];
  sessionToken: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(config);
  const [imageError, setImageError] = useState<string | null>(null);

  // Sync local state when config prop changes (e.g. after image upload)
  useEffect(() => {
    setLocal(config);
  }, [config]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const hasChanges = JSON.stringify(local) !== JSON.stringify(config);
  const imageUrl = resolveImageUrl(local.image_url, local.slug);

  const update = useCallback((partial: Partial<DrinkConfig>) => {
    setLocal(prev => {
      const next = { ...prev, ...partial };

      // Auto-logic: "dose" never has allow_no_alcohol
      if (next.slug === 'dose') {
        next.allow_no_alcohol = false;
      }


      return next;
    });
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImageError(null);

    // Validate type and size
    const typeError = validateImageFile(file);
    if (typeError) {
      setImageError(typeError);
      toast({ title: '⚠️ Imagem inválida', description: typeError, variant: 'destructive' });
      return;
    }

    // Validate dimensions (warning only - will auto-resize)
    const dimWarning = await validateImageDimensions(file);
    if (dimWarning && dimWarning.includes('Não foi possível')) {
      setImageError(dimWarning);
      toast({ title: '⚠️ Erro', description: dimWarning, variant: 'destructive' });
      return;
    }

    onImageUpload(file);
  };

  const enabledSteps = (['step_doses', 'step_energetico', 'step_gelo', 'step_frutas', 'step_ice'] as const)
    .filter(s => local[s]);

  const isDose = local.slug === 'dose';

  return (
    <Card className={`transition-all ${!local.is_enabled ? 'opacity-60 grayscale-[30%]' : ''}`}>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-center gap-3">
          {/* Image thumbnail */}
          <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-muted flex-shrink-0 border-2 border-border">
            <img
              src={imageUrl}
              alt={local.label}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/assets/drinks/batida.webp';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-bold truncate">{local.label}</CardTitle>
              <Badge variant={local.is_enabled ? "default" : "secondary"} className="text-[10px] h-5">
                {local.is_enabled ? 'Ativo' : 'Inativo'}
              </Badge>
              {isDose && (
                <Badge variant="outline" className="text-[10px] h-5 border-amber-500 text-amber-600">
                  Somente Dose
                </Badge>
              )}
            </div>
            <div className="flex gap-1 mt-1 items-center">
              {enabledSteps.map(step => {
                const info = STEP_ICONS[step];
                const Icon = info.icon;
                return <Icon key={step} className={`h-3.5 w-3.5 ${info.color}`} />;
              })}
              {local.allow_no_alcohol && (
                <Ban className="h-3.5 w-3.5 text-red-400 ml-0.5" />
              )}
              {enabledSteps.length === 0 && (
                <span className="text-[10px] text-muted-foreground">Nenhum passo configurado</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Switch
              checked={local.is_enabled}
              onCheckedChange={(v) => update({ is_enabled: v })}
            />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-3 pt-0 space-y-4">
          {/* ── Image Upload ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <ImageIcon className="h-3.5 w-3.5" /> Imagem do Ícone
            </Label>
            <div className="flex gap-3 items-start">
              <div className="w-20 h-20 rounded-xl overflow-hidden bg-muted border-2 border-border flex-shrink-0">
                <img
                  src={imageUrl}
                  alt={local.label}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/assets/drinks/batida.webp';
                  }}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  ref={fileRef}
                  onChange={handleFileSelect}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs h-8"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Enviando...</>
                  ) : (
                    <><Upload className="h-3 w-3 mr-1" /> Trocar Imagem</>
                  )}
                </Button>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p>📐 Máx: {MAX_IMAGE_PX}×{MAX_IMAGE_PX}px</p>
                  <p>📦 Máx: {MAX_ORIGINAL_SIZE_MB}MB • JPG, PNG, WebP</p>
                  <p>🔄 Auto-compressão para WebP</p>
                </div>
                {imageError && (
                  <div className="flex items-start gap-1 text-[10px] text-destructive">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{imageError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Label ── */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome exibido</Label>
            <Input
              value={local.label}
              onChange={(e) => update({ label: e.target.value })}
              className="h-8 text-sm"
              maxLength={30}
            />
          </div>

          {/* ── Steps Configuration ── */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Settings2 className="h-3.5 w-3.5" /> Passos da Montagem
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(STEP_ICONS) as Array<keyof typeof STEP_ICONS>).map(stepKey => {
                const info = STEP_ICONS[stepKey];
                const Icon = info.icon;
                const enabled = local[stepKey];
                return (
                  <button
                    key={stepKey}
                    onClick={() => update({ [stepKey]: !enabled } as any)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border-2 transition-all text-left ${
                      enabled
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-muted/30 opacity-60'
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${enabled ? info.color : 'text-muted-foreground'}`} />
                    <div className="min-w-0">
                      <span className="text-xs font-medium block truncate">{info.label}</span>
                      <span className="text-[10px] text-muted-foreground">{enabled ? 'Habilitado' : 'Desabilitado'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sem Álcool Option ── */}
          {!isDose && (
            <div className="space-y-2">
              <div className={`flex items-center justify-between p-2.5 rounded-lg border-2 transition-all ${
                local.allow_no_alcohol ? 'border-red-400/50 bg-red-50/30 dark:bg-red-950/20' : 'border-border bg-muted/30'
              }`}>
                <div className="flex items-center gap-2">
                  <Ban className={`h-4 w-4 ${local.allow_no_alcohol ? 'text-red-500' : 'text-muted-foreground'}`} />
                  <div>
                    <span className="text-xs font-medium block">Opção "Sem Álcool"</span>
                    <span className="text-[10px] text-muted-foreground">
                      {local.allow_no_alcohol ? 'Aparece como opção na seleção de dose' : 'Não disponível'}
                    </span>
                  </div>
                </div>
                <Switch
                  checked={local.allow_no_alcohol}
                  onCheckedChange={(v) => update({ allow_no_alcohol: v })}
                />
              </div>
              {local.allow_no_alcohol && (
                <div className="space-y-1 pl-6">
                  <Label className="text-xs">Valor cobrado (oculto do cliente)</Label>
                  <CurrencyInput
                    value={local.no_alcohol_price}
                    onChange={(v) => update({ no_alcohol_price: v })}
                    size="sm"
                    step={0.50}
                    placeholder="0,00"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Cobrado como se fosse uma dose para compensar o valor do drink.
                  </p>
                </div>
              )}
            </div>
          )}
          {isDose && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-border bg-muted/30 opacity-60">
              <Ban className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Categoria "Dose" não permite opção sem álcool
              </span>
            </div>
          )}

          {/* ── Valor Agregado ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1">
              💰 Valor Agregado (preparo)
            </Label>
            <CurrencyInput
              value={local.base_price}
              onChange={(v) => update({ base_price: v })}
              size="sm"
              step={0.50}
              placeholder="0,00"
            />
            <p className="text-[10px] text-muted-foreground">
              Valor somado ao custo das doses para cobrir preparo, ingredientes base e mão de obra. Ex: Dose R$35 + Agregado R$20 = R$55.
            </p>
          </div>

          {/* ── Numeric Settings ── */}
          <div className="grid grid-cols-2 gap-3">
            {local.step_adicionais && (
              <div className="space-y-1">
                <Label className="text-xs">Preço Adicional</Label>
                <CurrencyInput
                  value={local.adicional_price}
                  onChange={(v) => update({ adicional_price: v })}
                  size="sm"
                  step={0.50}
                  placeholder="0,00"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Ordem no carrossel</Label>
              <Input
                type="number"
                min={0}
                max={20}
                value={local.sort_order}
                onChange={(e) => update({ sort_order: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                onBlur={(e) => { const v = parseInt(e.target.value) || 0; update({ sort_order: Math.max(0, Math.min(20, v)) }); }}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* ── Allowed Bottles ── */}
          {(local.step_doses || local.step_energetico) && (
            <AllowedBottlesSelector configId={config.id} openBottles={openBottles} sessionToken={sessionToken} />
          )}

          {/* ── Gradient ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1">
              <Palette className="h-3.5 w-3.5" /> Gradiente (Tailwind)
            </Label>
            <Input
              value={local.gradient}
              onChange={(e) => update({ gradient: e.target.value })}
              className="h-8 text-xs font-mono"
              placeholder="from-pink-500 to-rose-600"
            />
            <div className={`h-4 rounded bg-gradient-to-r ${local.gradient}`} />
          </div>

          {/* ── Save Button ── */}
          {hasChanges && (
            <Button
              size="sm"
              className="w-full gap-1"
              disabled={saving}
              onClick={() => onSave({
                label: local.label,
                is_enabled: local.is_enabled,
                sort_order: local.sort_order,
                gradient: local.gradient,
                step_doses: local.step_doses,
                step_energetico: local.step_energetico,
                step_gelo: local.step_gelo,
                step_frutas: local.step_frutas,
                step_ice: local.step_ice,
                step_adicionais: local.step_adicionais,
                adicional_price: local.adicional_price,
                allow_no_alcohol: local.allow_no_alcohol,
                base_price: local.base_price,
                no_alcohol_price: local.no_alcohol_price,
              })}
            >
              {saving ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando...</>
              ) : (
                <><Save className="h-3.5 w-3.5" /> Salvar Alterações</>
              )}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Fruit Price Manager ─── */
function FruitPriceManager() {
  const [savingFruitId, setSavingFruitId] = useState<string | null>(null);

  const { data: fruits = [] } = useDrinkFruits({ activeOnly: false });

  const updateFruitMutation = useUpdateFruit();

  const handleUpdate = (params: { id: string; price?: number; is_active?: boolean }) => {
    setSavingFruitId(params.id);
    updateFruitMutation.mutate(params, {
      onSettled: () => setSavingFruitId(null),
    });
  };

  // Ícone: usa icon_url do banco; fallback para emoji centralizado.


  if (fruits.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-sm flex items-center gap-2">
          🍓 Frutas dos Drinks
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {fruits.map((fruit: any) => (
            <div
              key={fruit.id}
              className={`flex items-center gap-2 p-2 rounded-lg border transition-opacity ${
                fruit.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
              }`}
            >
              {fruit.icon_url ? (
                <img src={fruit.icon_url} alt={fruit.name} className="w-7 h-7 object-contain shrink-0" />
              ) : (
                <span className="text-xl">{getFruitEmoji(fruit.name)}</span>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{fruit.name}</p>
                <CurrencyInput
                  value={Number(fruit.price)}
                  onChange={(v) => handleUpdate({ id: fruit.id, price: v })}
                  size="sm"
                  step={0.50}
                  placeholder="0,00"
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {savingFruitId === fruit.id && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                <Switch
                  checked={fruit.is_active}
                  onCheckedChange={(checked) => handleUpdate({ id: fruit.id, is_active: checked })}
                  className="scale-75"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Main Tab Component ─── */
export function SpecialDrinksConfigTab({ sessionTokenOverride }: { sessionTokenOverride?: string | null } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sessionToken: authSessionToken } = useAuth();
  const sessionToken = sessionTokenOverride || getAdminSessionToken(authSessionToken);
  const [uploadingSlug, setUploadingSlug] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['special-drink-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('special_drink_configs')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data as DrinkConfig[];
    },
  });

  const { data: openBottles = [] } = useQuery({
    queryKey: ['allowed-bottle-candidates-admin'],
    queryFn: async () => {
      // Lista TODOS os produtos líquidos ativos (não apenas garrafas abertas),
      // para que o admin possa pré-habilitar mesmo antes da cozinha abrir.
      const LIQUID_TYPES = ['destilado', 'whisky', 'gin', 'vodka', 'cachaca', 'licor', 'corote', 'vinho', 'energetico', 'espumante'];
      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, product_type, stock')
        .eq('is_active', true)
        .in('product_type', LIQUID_TYPES)
        .order('product_type', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;

      // Busca garrafas abertas para mostrar status (Aberta/Fechada)
      const { data: bottles } = await supabase.rpc('get_open_bottles');
      const openMap = new Map<string, { remaining: number; price: number; isEmpty: boolean }>();
      (bottles || []).forEach((b: any) => {
        const cur = openMap.get(b.product_id);
        if (!cur || (!b.is_empty && b.remaining_doses > 0)) {
          openMap.set(b.product_id, {
            remaining: Number(b.remaining_doses) || 0,
            price: Number(b.dose_price) || 0,
            isEmpty: !!b.is_empty,
          });
        }
      });

      return (products || []).map((p: any) => {
        const open = openMap.get(p.id);
        return {
          id: p.id,
          product_id: p.id,
          product_name: p.name,
          product_type: p.product_type,
          dose_price: open?.price ?? 0,
          remaining_doses: open?.remaining ?? 0,
          is_open: !!open && !open.isEmpty && (open.remaining > 0),
        } as OpenBottleInfo & { is_open: boolean };
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DrinkConfig> }) => {
      setSavingId(id);
      const { error } = await supabase.rpc('update_special_drink_config', {
        p_id: id,
        p_updates: updates as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['special-drink-configs'] });
      toast({ title: '✅ Configuração salva!' });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    },
    onSettled: () => setSavingId(null),
  });

  const handleImageUpload = async (configId: string, slug: string, file: File) => {
    setUploadingSlug(slug);
    try {
      // Compressão iterativa - garante < 200KB para base64 na Edge Function
      const compressed = await compressImage(file, MAX_IMAGE_PX, 0.7);

      console.log(`[DrinkConfig] Compressed: ${formatBytes(file.size)} → ${formatBytes(compressed.compressedSize)}`);

      const { publicUrl } = await uploadImage(compressed.file, 'drink-types');

      const { error } = await supabase.rpc('update_special_drink_config', {
        p_id: configId,
        p_updates: { image_url: publicUrl },
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['special-drink-configs'] });
      toast({
        title: '✅ Imagem atualizada!',
        description: `${compressed.width}×${compressed.height}px • ${formatBytes(compressed.compressedSize)}`,
      });
    } catch (err) {
      console.error('[handleImageUpload]', err);
      toast({ title: 'Erro no upload da imagem', variant: 'destructive' });
    } finally {
      setUploadingSlug(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">⚙️ Configuração - Monte seu Drink</h2>
        <p className="text-sm text-muted-foreground">
          Configure os botões do carrossel, passos de montagem, imagens e propriedades de cada categoria especial.
        </p>
      </div>

      {/* ── Fruit Price Manager ── */}
      <FruitPriceManager />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {configs.map((config) => (
          <ConfigCard
            key={config.id}
            config={config}
            uploading={uploadingSlug === config.slug}
            saving={savingId === config.id}
            openBottles={openBottles}
            sessionToken={sessionToken}
            onSave={(updates) => saveMutation.mutate({ id: config.id, updates })}
            onImageUpload={(file) => handleImageUpload(config.id, config.slug, file)}
          />
        ))}
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>💡 Dicas:</strong></p>
            <ul className="list-disc pl-3 space-y-0.5">
              <li><strong>Imagens:</strong> Até {MAX_ORIGINAL_SIZE_MB}MB, auto-compressão para {MAX_IMAGE_PX}×{MAX_IMAGE_PX}px WebP.</li>
              <li><strong>Passos:</strong> Desabilitar um passo zera seus limites automaticamente.</li>
              <li><strong>Sem Álcool:</strong> Disponível para todas as categorias exceto "Dose".</li>
              <li><strong>Ordem:</strong> Menor número aparece primeiro no carrossel.</li>
              <li><strong>Gradiente:</strong> Classes Tailwind como <code>from-pink-500 to-rose-600</code></li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
