import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { normalizeSearch } from '@/lib/text-utils';
import { DraftTabs, type DraftTab } from '@/components/pdv/DraftTabs';
import { CustomerNameInput } from '@/components/pdv/CustomerNameInput';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  ShoppingCart, 
  Search, 
  CreditCard, 
  Banknote, 
  QrCode,
  LogOut,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  ScanLine,
  Camera,
  Store,
  Printer,
  Layers,
  Wine
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SmartImage } from '@/components/SmartImage';
import { W_CARD } from '@/lib/image-url';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { usePDVRealtime } from '@/hooks/use-realtime-sync';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
import type { Product, Category, CustomDrink } from '@/shared/schema';
import { type PaymentMethod, isInfiniteStockProduct } from '@/shared/schema';
import { CartContent } from '@/components/pdv-cart';
import { VoiceOrderButton } from '@/components/pdv/VoiceOrderButton';
import { RecentDrinksButton, rememberRecentDrink } from '@/components/pdv/RecentDrinksButton';

import { mapProduct, mapCategory } from '@/lib/db-mappers';
import { parseNumeric } from '@/lib/format-utils';
import { playSuccessBeep, playErrorBeep } from '@/lib/scanner-sound';
import { printOrderTicket } from '@/lib/print-ticket';
import { playCashRegisterSound, primeCashRegisterSound } from '@/lib/cash-register-sound';
import type { PaymentSplit } from '@/components/pdv/CompositePaymentModal';
import { StoreStatusToggle } from '@/components/StoreStatusToggle';
import { SpecialDrinksCarousel } from '@/components/home/SpecialDrinksCarousel';
import { FeatureBannerCarousel } from '@/components/home/FeatureBannerCarousel';

// Lazy-loaded modals — only fetch chunks when actually opened (huge bundle reduction)
const PixQRCodeModal = lazy(() => import('@/components/PixQRCodeModal').then(m => ({ default: m.PixQRCodeModal })));
const SaqDepModal = lazy(() => import('@/components/pdv/SaqDepModal').then(m => ({ default: m.SaqDepModal })));

const CadernetaModal = lazy(() => import('@/components/pdv/CadernetaModal').then(m => ({ default: m.CadernetaModal })));
const CompositePaymentModal = lazy(() => import('@/components/pdv/CompositePaymentModal').then(m => ({ default: m.CompositePaymentModal })));
const PixPosProofModal = lazy(() => import('@/components/pdv/PixPosProofModal').then(m => ({ default: m.PixPosProofModal })));
const CustomDrinkModal = lazy(() => import('@/components/home/CustomDrinkModal').then(m => ({ default: m.CustomDrinkModal })));
const CaipirinhaModal = lazy(() => import('@/components/home/CaipirinhaModal').then(m => ({ default: m.CaipirinhaModal })));
const CopaoModal = lazy(() => import('@/components/home/CopaoModal').then(m => ({ default: m.CopaoModal })));
const CaipiIceModal = lazy(() => import('@/components/home/CaipiIceModal').then(m => ({ default: m.CaipiIceModal })));
const ComboModal = lazy(() => import('@/components/home/ComboModal').then(m => ({ default: m.ComboModal })));
const SpecialDrinksModal = lazy(() => import('@/components/home/SpecialDrinksModal').then(m => ({ default: m.SpecialDrinksModal })));
const PremiumDrinksModal = lazy(() => import('@/components/home/PremiumDrinksModal').then(m => ({ default: m.PremiumDrinksModal })));
const LooseCigaretteSelector = lazy(() => import('@/components/pdv/LooseCigaretteSelector').then(m => ({ default: m.LooseCigaretteSelector })));
const PDVCameraScanner = lazy(() => import('@/components/BarcodeScanner').then(m => ({ default: m.PDVCameraScanner })));
import { buildLooseCigaretteItemName, parseLooseCigarettePackId, buildCustomDrinkProductName, type LooseCigaretteSelection } from '@/components/pdv/loose-cigarette-utils';
import { nanoid } from 'nanoid';
import { explodeCopaoToOrderItems, isRecipeDrink } from '@/lib/copao-recipe';
import { calculatePdvBeerDiscount } from '@/lib/beer-discount';
import { calcPosCouponDiscount, redeemPosCoupon, validatePosCoupon, type PosCoupon } from '@/lib/pos-coupon';
import { computeCartPromoDiscount, inferCustomDrinkTypeKey, useActivePromotions } from '@/lib/weekly-promotions';
import { PanelSwitcher } from '@/components/admin/PanelSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualViewportHeight } from '@/hooks/use-visual-viewport-height';
interface CartItem {
  product: Product;
  quantity: number;
}

interface DraftState {
  cart: CartItem[];
  pdvCustomDrinks: CustomDrink[];
  notes: string;
  manualDiscount: string;
  manualSurcharge: string;
}

function createEmptyDraft(): DraftState {
  return { cart: [], pdvCustomDrinks: [], notes: '', manualDiscount: '', manualSurcharge: '' };
}

// --- Persistência local de rascunhos do PDV ---
// Evita perda das adições em memória se o navegador recarregar, ErrorBoundary disparar
// ou o operador apertar "Recarregar" antes de finalizar o pedido.
const PDV_DRAFTS_STORAGE_KEY = 'pdv-drafts-v1';
interface PersistedDrafts {
  drafts: Record<string, DraftState>;
  draftOrder: string[];
  activeDraftId: string;
}
function loadPersistedDrafts(): PersistedDrafts | null {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(PDV_DRAFTS_STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedDrafts;
    if (!parsed?.drafts || typeof parsed.drafts !== 'object') return null;
    if (!Array.isArray(parsed.draftOrder) || parsed.draftOrder.length === 0) return null;
    if (!parsed.activeDraftId || !parsed.drafts[parsed.activeDraftId]) return null;
    // Sanitiza cada draft para garantir shape esperado
    const cleaned: Record<string, DraftState> = {};
    for (const id of parsed.draftOrder) {
      const d = parsed.drafts[id];
      if (!d) continue;
      cleaned[id] = {
        cart: Array.isArray(d.cart) ? d.cart.filter(i => i?.product?.id && typeof i.quantity === 'number') : [],
        pdvCustomDrinks: Array.isArray(d.pdvCustomDrinks) ? d.pdvCustomDrinks : [],
        notes: typeof d.notes === 'string' ? d.notes : '',
        manualDiscount: typeof d.manualDiscount === 'string' ? d.manualDiscount : '',
        manualSurcharge: typeof d.manualSurcharge === 'string' ? d.manualSurcharge : '',
      };
    }
    if (Object.keys(cleaned).length === 0) return null;
    return { drafts: cleaned, draftOrder: parsed.draftOrder.filter(id => cleaned[id]), activeDraftId: cleaned[parsed.activeDraftId] ? parsed.activeDraftId : Object.keys(cleaned)[0] };
  } catch {
    return null;
  }
}

interface PdvOrderItemPayload {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_wizard_item?: boolean;
}

interface PdvOrderPayload {
  order: {
    user_id: string | null;
    order_type: 'counter';
    status: 'accepted';
    subtotal: number;
    delivery_fee: number;
    discount: number;
    total: number;
    payment_method: PaymentMethod;
    change_for: number | null;
    notes: string | null;
    customer_name: string;
    salesperson: string | null;
  };
  items: PdvOrderItemPayload[];
}

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num);
}

export default function PDV() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, logout, isHydrated } = useAuth();
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  // Cupom geral aplicado (PDV) — nível componente, limpo ao trocar de rascunho/concluir venda
  const [appliedCoupon, setAppliedCoupon] = useState<PosCoupon | null>(null);
  
  // --- Draft tabs state (hidratado do localStorage para sobreviver a refresh/ErrorBoundary) ---
  const persisted = useMemo(() => loadPersistedDrafts(), []);
  const [initialDraftId] = useState(() => persisted?.activeDraftId ?? nanoid(6));
  const [drafts, setDrafts] = useState<Record<string, DraftState>>(() =>
    persisted?.drafts ?? { [initialDraftId]: createEmptyDraft() }
  );
  const [draftOrder, setDraftOrder] = useState<string[]>(() =>
    persisted?.draftOrder ?? [initialDraftId]
  );
  const [activeDraftId, setActiveDraftId] = useState<string>(initialDraftId);

  // Persiste rascunhos no localStorage a cada mudança (debounced via microtask).
  // Garantia: se a aba der refresh/erro inesperado, o operador volta com o pedido em construção.
  useEffect(() => {
    try {
      const payload: PersistedDrafts = { drafts, draftOrder, activeDraftId };
      window.localStorage.setItem(PDV_DRAFTS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage cheio/bloqueado — falha silenciosa, sem quebrar o PDV
    }
  }, [drafts, draftOrder, activeDraftId]);


  // Derived: active draft's cart/notes/discount/customDrinks
  const activeDraft = drafts[activeDraftId] ?? createEmptyDraft();
  const cart = activeDraft.cart;
  const pdvCustomDrinks = activeDraft.pdvCustomDrinks;
  const notes = activeDraft.notes;
  const manualDiscount = activeDraft.manualDiscount;
  const manualSurcharge = activeDraft.manualSurcharge;

  // Setters that update the active draft
  const setCart = useCallback((updater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => {
    setDrafts(prev => {
      const current = prev[activeDraftId] ?? createEmptyDraft();
      const newCart = typeof updater === 'function' ? updater(current.cart) : updater;
      return { ...prev, [activeDraftId]: { ...current, cart: newCart } };
    });
  }, [activeDraftId]);

  const setPdvCustomDrinks = useCallback((updater: CustomDrink[] | ((prev: CustomDrink[]) => CustomDrink[])) => {
    setDrafts(prev => {
      const current = prev[activeDraftId] ?? createEmptyDraft();
      const newDrinks = typeof updater === 'function' ? updater(current.pdvCustomDrinks) : updater;
      return { ...prev, [activeDraftId]: { ...current, pdvCustomDrinks: newDrinks } };
    });
  }, [activeDraftId]);

  const setNotes = useCallback((val: string) => {
    setDrafts(prev => {
      const current = prev[activeDraftId] ?? createEmptyDraft();
      return { ...prev, [activeDraftId]: { ...current, notes: val } };
    });
  }, [activeDraftId]);

  const setManualDiscount = useCallback((val: string) => {
    setDrafts(prev => {
      const current = prev[activeDraftId] ?? createEmptyDraft();
      return { ...prev, [activeDraftId]: { ...current, manualDiscount: val } };
    });
  }, [activeDraftId]);

  const setManualSurcharge = useCallback((val: string) => {
    setDrafts(prev => {
      const current = prev[activeDraftId] ?? createEmptyDraft();
      return { ...prev, [activeDraftId]: { ...current, manualSurcharge: val } };
    });
  }, [activeDraftId]);

  const handleAddDraft = useCallback(() => {
    const id = nanoid(6);
    setDrafts(prev => ({ ...prev, [id]: createEmptyDraft() }));
    setDraftOrder(prev => [...prev, id]);
    setActiveDraftId(id);
  }, []);

  const handleRemoveDraft = useCallback((id: string) => {
    setDraftOrder(prev => {
      const next = prev.filter(d => d !== id);
      if (next.length === 0) {
        const newId = nanoid(6);
        setDrafts({ [newId]: createEmptyDraft() });
        setActiveDraftId(newId);
        return [newId];
      }
      if (activeDraftId === id) {
        const idx = prev.indexOf(id);
        setActiveDraftId(next[Math.min(idx, next.length - 1)]);
      }
      setDrafts(prev2 => {
        const copy = { ...prev2 };
        delete copy[id];
        return copy;
      });
      return next;
    });
  }, [activeDraftId]);

  const draftTabs: DraftTab[] = draftOrder.map((id, i) => ({
    id,
    label: `Venda ${i + 1}`,
    itemCount: (drafts[id]?.cart.length ?? 0) + (drafts[id]?.pdvCustomDrinks.length ?? 0),
  }));

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [changeFor, setChangeFor] = useState('');
  const [customerName, setCustomerName] = useState('');
  const pdvCustomerName = customerName.trim() ? customerName.trim().toUpperCase() : 'Balcão';
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [stockAlertProduct, setStockAlertProduct] = useState<Product | null>(null);
  const [showPixModal, setShowPixModal] = useState(false);
  const [showPixPosProofModal, setShowPixPosProofModal] = useState(false);
  const [pixPosProofOrderId, setPixPosProofOrderId] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  // PIX: payload guardado em memória — pedido só será criado APÓS confirmação do MP
  const [pendingPixPayload, setPendingPixPayload] = useState<{
    order: Record<string, unknown>;
    items: PdvOrderItemPayload[];
    tempRef: string;
  } | null>(null);
  const [continuousMode, setContinuousMode] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraScannerMounted, setCameraScannerMounted] = useState(false);
  const [visibleProductLimit, setVisibleProductLimit] = useState(80);
  const [showSaqDepModal, setShowSaqDepModal] = useState(false);
  
  const [showCadernetaModal, setShowCadernetaModal] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [lastOrderForPrint, setLastOrderForPrint] = useState<any>(null);
  const [customDrinkOpen, setCustomDrinkOpen] = useState(false);
  const [caipirinhaOpen, setCaipirinhaOpen] = useState(false);
  const [copaoOpen, setCopaoOpen] = useState(false);
  const [caipiIceOpen, setCaipiIceOpen] = useState(false);
  const [selectedDrinkType, setSelectedDrinkType] = useState<string | null>(null);
  const [comboOpen, setComboOpen] = useState(false);
  const [specialDrinksOpen, setSpecialDrinksOpen] = useState(false);
  const [premiumDrinksOpen, setPremiumDrinksOpen] = useState(false);
  const [showCompositePayment, setShowCompositePayment] = useState(false);
  const [compositePixAmount, setCompositePixAmount] = useState<number | null>(null);
  const [showCigaretteModal, setShowCigaretteModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const vvHeight = useVisualViewportHeight();

  const isAuthorized = isHydrated && (role === 'pdv' || role === 'kitchen' || role === 'log' || role === 'admin');

  useEffect(() => {
    if (!isAuthorized) return;
    const unlock = () => primeCashRegisterSound();
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', unlock, { capture: true } as EventListenerOptions);
    };
  }, [isAuthorized]);

  // Redirect to home if not authorized (wait for hydration)
  useEffect(() => {
    if (isHydrated && !isAuthorized) {
      navigate('/');
    }
  }, [isHydrated, isAuthorized, navigate]);

  // Realtime sync for PDV - automatic query invalidation for products, orders, cash register
  usePDVRealtime({ enabled: isAuthorized });
  const activePromotions = useActivePromotions();
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['pdv-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, image_url, cost_price, profit_margin, sale_price, stock, category_id, is_active, sort_order, is_prepared, combo_eligible, barcode, product_type, created_at, tier')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data || []).map(mapProduct);
    },
    enabled: isAuthorized,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['pdv-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, icon_url, sort_order, is_active, is_special, created_at')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) return [];
      return (data || []).map(mapCategory);
    },
    enabled: isAuthorized,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const calculateItemsSubtotal = useCallback((items: PdvOrderItemPayload[]) => {
    return Number(
      items
        .reduce((sum, item) => {
          const lineTotal = parseNumeric(item.total_price, NaN);
          if (Number.isFinite(lineTotal)) return sum + lineTotal;

          const unitPrice = parseNumeric(item.unit_price);
          const quantity = parseNumeric(item.quantity, 1) || 1;
          return sum + unitPrice * quantity;
        }, 0)
        .toFixed(2)
    );
  }, []);

  const buildSafeOrderTotals = useCallback((order: PdvOrderPayload['order'], items: PdvOrderItemPayload[]) => {
    const subtotalFromItems = calculateItemsSubtotal(items);
    const deliveryFee = parseNumeric(order.delivery_fee);
    const discount = parseNumeric(order.discount);
    const totalFromItems = Number(Math.max(0, subtotalFromItems + deliveryFee - discount).toFixed(2));

    return {
      subtotalFromItems,
      deliveryFee,
      discount,
      totalFromItems,
    };
  }, [calculateItemsSubtotal]);

  const buildCounterOrderRpcPayload = useCallback((order: PdvOrderPayload['order'], items: PdvOrderItemPayload[], clientRequestId?: string) => {
    const { subtotalFromItems, deliveryFee, discount, totalFromItems } = buildSafeOrderTotals(order, items);

    return {
      p_user_id: order.user_id ?? null,
      p_subtotal: subtotalFromItems,
      p_delivery_fee: deliveryFee,
      p_discount: discount,
      p_total: totalFromItems,
      p_payment_method: order.payment_method,
      p_items: JSON.stringify(items),
      p_change_for: order.change_for ?? null,
      p_notes: order.notes ?? null,
      p_customer_name: order.customer_name || 'Balcão',
      p_salesperson: order.salesperson ?? null,
      p_client_request_id: clientRequestId ?? ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    };
  }, [buildSafeOrderTotals]);

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: PdvOrderPayload) => {
      console.log('PDV createOrder payload:', JSON.stringify(orderData.order));
      console.log('PDV createOrder items:', JSON.stringify(orderData.items));

      const rpcPayload = buildCounterOrderRpcPayload(orderData.order, orderData.items);
      console.log('PDV normalized totals:', JSON.stringify({
        subtotalFromItems: rpcPayload.p_subtotal,
        deliveryFee: rpcPayload.p_delivery_fee,
        discount: rpcPayload.p_discount,
        totalFromItems: rpcPayload.p_total,
      }));
      
      if (!orderData.items || orderData.items.length === 0) {
        throw new Error('Não é possível criar pedido vazio. Adicione pelo menos um item.');
      }

      // RPC SECURITY DEFINER cria pedido + itens em transação atômica.
      // client_request_id no payload garante idempotência: retries de rede não duplicam.
      // rpcPayload sends explicit `null` for optional args (required by PostgREST overload
      // resolution — see Checkout.tsx), which the generated RPC arg types don't allow.
      const { data: orderId, error: orderError } = await supabase.rpc('create_counter_order_with_items', rpcPayload as any);

      if (orderError || !orderId) {
        console.error('[PDV] RPC create_counter_order_with_items failed:', orderError);
        throw new Error(orderError?.message || 'Falha ao registrar pedido. Tente novamente.');
      }

      console.log('PDV createOrder result:', orderId);

      return { id: orderId as string, items: orderData.items };
    },
    onSuccess: async (data) => {
      // NOVA REGRA: TODO pedido passa por Cozinha ou Logística.
      // - Itens preparados (monte seu drink / is_prepared) → Cozinha (KDE) → depois Logística.
      // - Demais itens → Logística direto (retirada no balcão via "Retirado pelo Cliente").
      // Nenhum pedido de balcão é mais marcado como ENTREGUE automaticamente na criação.

      // Decrement open_packs for any loose-cigarette items in the cart
      try {
        await consumeLooseCigarettesFromCart(data.id as string, pdvCustomDrinks);
      } catch (err) {
        console.warn('[PDV] Falha ao decrementar maços abertos:', err);
      }


      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      // Cash register "ka-ching!" — replaces the generic notification beep for PDV sales
      void playCashRegisterSound(0.7);
      toast({ title: 'Pedido criado com sucesso!' });
      
      // Save order data for print before clearing cart
      const orderForPrint = {
        id: data.id,
        orderType: 'counter' as const,
        status: 'accepted' as const,
        subtotal: orderSubtotal,
        deliveryFee: 0,
        discount: discountValue,
        total,
        paymentMethod: paymentMethod || 'cash',
        changeFor: paymentMethod === 'cash' && changeFor ? Number(changeFor) : null,
        notes: notes || null,
        customerName: pdvCustomerName,
        salesperson: null,
        createdAt: new Date().toISOString(),
        items: [
          ...cart.map(item => ({
            id: '',
            orderId: data.id,
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: parseNumeric(item.product.salePrice),
            totalPrice: parseNumeric(item.product.salePrice) * item.quantity,
          })),
          ...pdvCustomDrinks.map(drink => ({
            id: '',
            orderId: data.id,
            productId: null as string | null,
            productName: buildCustomDrinkProductName(drink.name, drink.description),
            quantity: drink.quantity || 1,
            unitPrice: parseNumeric(drink.totalPrice),
            totalPrice: parseNumeric(drink.totalPrice) * (drink.quantity || 1),
          })),
        ],
      };
      setLastOrderForPrint(orderForPrint);
      setShowPrintDialog(true);

      // If composite payment includes PIX, show QR code
      if (compositePixAmount && compositePixAmount > 0) {
        setPendingOrderId(data.id as string);
        setShowPixModal(true);
      }

      // If PIX POS, show proof modal for photo upload
      if (paymentMethod === 'pix_pos') {
        setPixPosProofOrderId(data.id as string);
        setShowPixPosProofModal(true);
      }
      
      setCart([]);
      setPdvCustomDrinks([]);
      setNotes('');
      setPaymentMethod(null);
      setChangeFor('');
      setCustomerName('');
      setManualDiscount(''); setManualSurcharge('');
      void finalizeAppliedCoupon();
      setIsPaymentDialogOpen(false);
      setIsCartOpen(false);
    },
    onError: (error: any) => {
      console.error('PDV Order creation error:', JSON.stringify(error, null, 2));
      console.error('PDV Order error message:', error?.message);
      console.error('PDV Order error details:', error?.details);
      console.error('PDV Order error hint:', error?.hint);
      toast({ title: 'Erro ao criar pedido', description: error?.message || 'Erro desconhecido', variant: 'destructive' });
    },
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNotes(e.target.value);
  }, [setNotes]);

  const handleDiscountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setManualDiscount(e.target.value);
  }, [setManualDiscount]);

  const handleSurchargeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setManualSurcharge(e.target.value);
  }, [setManualSurcharge]);

  const buildSurchargeItem = useCallback((value: number): PdvOrderItemPayload | null => {
    if (!value || value <= 0) return null;
    return {
      product_id: null,
      product_name: 'ACRÉSCIMO MANUAL',
      quantity: 1,
      unit_price: Number(value.toFixed(2)),
      total_price: Number(value.toFixed(2)),
    };
  }, []);


  // Estoque infinito = SOMENTE bebidas feitas na hora. Salgados/lanches são
  // físicos e devem respeitar o estoque (baixam normalmente).
  const isInfiniteStock = useCallback((product: Product): boolean => {
    const category = categories.find(c => c.id === product.categoryId);
    return isInfiniteStockProduct(product, category?.name);
  }, [categories]);

  const addToCart = useCallback((product: Product) => {
    const infinite = isInfiniteStock(product);
    
    setCart(prev => {
      const existingItem = prev.find(item => item.product.id === product.id);
      const currentQty = existingItem?.quantity ?? 0;
      
      if (!infinite && (product.stock <= 0 || currentQty >= product.stock)) {
        setStockAlertProduct(product);
        return prev;
      }
      
      if (existingItem) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, [isInfiniteStock, setCart]);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart(prev => {
      const item = prev.find(i => i.product.id === productId);
      if (!item) return prev;
      
      const infinite = isInfiniteStock(item.product);
      
      if (delta > 0 && !infinite && item.quantity >= item.product.stock) {
        setStockAlertProduct(item.product);
        return prev;
      }
      
      return prev.map(i => {
        if (i.product.id === productId) {
          const newQty = i.quantity + delta;
          return newQty > 0 ? { ...i, quantity: newQty } : i;
        }
        return i;
      }).filter(i => i.quantity > 0);
    });
  }, [isInfiniteStock, setCart]);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }, [setCart]);

  // Handle barcode scan - find product by barcode and add to cart
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    // Clean barcode - remove any whitespace or special characters
    const cleanBarcode = barcode.trim().replace(/[^0-9a-zA-Z]/g, '');
    if (import.meta.env.DEV) console.log('[PDV] handleBarcodeScan chamado com:', `"${barcode}"`, '-> limpo:', `"${cleanBarcode}"`);
    
    if (!cleanBarcode) {
      if (import.meta.env.DEV) console.log('[PDV] Código vazio após limpeza');
      return false;
    }
    
    // First try to find in already loaded products (faster)
    if (import.meta.env.DEV) console.log('[PDV] Produtos carregados:', products.length);
    const productByBarcode = products.find((p: any) => p.barcode === cleanBarcode);
    
    if (productByBarcode) {
      if (import.meta.env.DEV) console.log('[PDV] Produto encontrado localmente:', productByBarcode.name);
      playSuccessBeep(); // Play beep on successful scan
      addToCart(productByBarcode);
      toast({ title: `${productByBarcode.name} adicionado!` });
      return true;
    }
    
    // Try to find product by barcode via RPC
    if (import.meta.env.DEV) console.log('[PDV] Não encontrado localmente, buscando no banco de dados...');
    const { data, error } = await supabase.rpc('find_product_by_barcode', { p_barcode: cleanBarcode });
    
    if (error) {
      if (import.meta.env.DEV) console.error('[PDV] Erro ao buscar produto:', error);
      playErrorBeep();
      toast({ title: 'Erro ao buscar produto', variant: 'destructive' });
      return false;
    }
    
    if (!data || data.length === 0) {
      if (import.meta.env.DEV) console.log('[PDV] Produto não encontrado para código:', cleanBarcode);
      playErrorBeep();
      toast({ title: 'Produto não encontrado', description: `Código: ${cleanBarcode}`, variant: 'destructive' });
      return false;
    }
    
    // Found product by barcode
    const productData = data[0];
    const mappedProduct = mapProduct(productData);
    if (import.meta.env.DEV) console.log('[PDV] Produto encontrado no DB:', mappedProduct.name);
    playSuccessBeep(); // Play beep on successful scan
    addToCart(mappedProduct);
    toast({ title: `${mappedProduct.name} adicionado!` });
    return true;
  }, [products, toast, addToCart]);

  // Debounce ref for USB scanner input
  const scanDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Handle search input - for USB scanner, wait for typing to stop (scanner types fast then stops)
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // In continuous mode, use debounce to wait for USB scanner to finish typing
    if (continuousMode) {
      // Clear previous debounce
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
      }
      
      // Wait 150ms after last keystroke (USB scanners type fast, humans don't)
      scanDebounceRef.current = setTimeout(async () => {
        const trimmedValue = value.trim();
        // Check if it looks like a barcode (numbers only, 8+ digits)
        const isBarcodePattern = /^\d{8,14}$/.test(trimmedValue);
        
        if (isBarcodePattern) {
          if (import.meta.env.DEV) console.log('[PDV] Modo contínuo - código detectado após debounce:', trimmedValue);
          const found = await handleBarcodeScan(trimmedValue);
          if (found) {
            setSearchTerm('');
            searchInputRef.current?.focus();
          }
        }
      }, 150);
    }
  }, [continuousMode, handleBarcodeScan]);

  // Handle Enter key on search - search by barcode or name (works in any mode)
  const handleSearchKeyDown = useCallback(async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      // Clear any pending debounce
      if (scanDebounceRef.current) {
        clearTimeout(scanDebounceRef.current);
        scanDebounceRef.current = null;
      }
      
      // Try as barcode first
      const found = await handleBarcodeScan(searchTerm.trim());
      if (found) {
        setSearchTerm('');
      }
      // If not found as barcode, it stays as text search (filtered products will show)
    }
  }, [searchTerm, handleBarcodeScan]);

  useEffect(() => {
    setVisibleProductLimit(80);
  }, [searchTerm, selectedCategory]);

  // (duplicate redirect removed - handled by useEffect at line 84)

  const filteredProducts = products.filter(p => {
    const searchNorm = normalizeSearch(searchTerm.trim());
    const matchesName = normalizeSearch(p.name).includes(searchNorm);
    const matchesBarcode = p.barcode && p.barcode.includes(searchTerm.trim());
    const matchesSearch = matchesName || matchesBarcode;
    const matchesCategory = !selectedCategory || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const visibleProducts = filteredProducts.slice(0, visibleProductLimit);
  const subtotal = cart.reduce((sum, item) => sum + parseNumeric(item.product.salePrice) * item.quantity, 0);
  const customDrinksTotal = pdvCustomDrinks.reduce((sum, d) => sum + parseNumeric(d.totalPrice) * (d.quantity || 1), 0);

  // Auto beer discount for PDV
  const pdvBeerDiscount = useMemo(() => {
    return calculatePdvBeerDiscount(
      cart.map(i => ({
        productId: i.product.id,
        productName: i.product.name,
        categoryId: i.product.categoryId,
        quantity: i.quantity,
        salePrice: parseNumeric(i.product.salePrice),
      }))
    );
  }, [cart]);

  const surchargeValue = parseFloat(manualSurcharge) || 0;
  const orderSubtotal = subtotal + customDrinksTotal + surchargeValue;

  // Desconto de cupom geral (PDV) aplicado sobre categorias elegíveis
  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const regularItems = cart.map(i => ({
      categoryId: i.product.categoryId,
      lineTotal: parseNumeric(i.product.salePrice) * i.quantity,
    }));
    return calcPosCouponDiscount(appliedCoupon, regularItems, customDrinksTotal).discount;
  }, [appliedCoupon, cart, customDrinksTotal]);

  const pdvPromotionResult = useMemo(() => computeCartPromoDiscount([
    ...cart.map((item) => ({
      productId: item.product.id,
      product: item.product,
      quantity: item.quantity,
      unitPrice: parseNumeric(item.product.salePrice),
    })),
    ...pdvCustomDrinks.map((drink) => ({
      quantity: Math.max(1, drink.quantity || 1),
      unitPrice: parseNumeric(drink.totalPrice),
      drinkTypeKey: inferCustomDrinkTypeKey(drink),
    })),
  ], activePromotions), [cart, pdvCustomDrinks, activePromotions]);

  const pdvPromotionDiscount = pdvPromotionResult.total;
  const pdvPromotionLabel = pdvPromotionResult.matches[0]?.match?.promo?.name;

  const discountValue = (parseFloat(manualDiscount) || 0) + pdvBeerDiscount.totalDiscount + couponDiscount + pdvPromotionDiscount;
  const total = Math.max(0, orderSubtotal - discountValue);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0) + pdvCustomDrinks.reduce((sum, d) => sum + (d.quantity || 1), 0);
  
  const change = paymentMethod === 'cash' && changeFor ? parseFloat(changeFor) - total : 0;

  // Limpa cupom ao trocar de rascunho (cada venda tem seu próprio cupom)
  useEffect(() => { setAppliedCoupon(null); }, [activeDraftId]);

  // Redime o cupom aplicado após a venda ser concluída com sucesso (atômico no banco)
  const finalizeAppliedCoupon = useCallback(async () => {
    if (!appliedCoupon) return;
    try {
      await redeemPosCoupon(appliedCoupon.id);
    } catch (err) {
      console.warn('[PDV] Falha ao redimir cupom (venda já concluída):', err);
    } finally {
      setAppliedCoupon(null);
    }
  }, [appliedCoupon]);

  const handleApplyCoupon = useCallback(async (code: string): Promise<boolean> => {
    const res = await validatePosCoupon(code);
    if (!res.valid || !res.coupon) {
      toast({ title: 'Cupom inválido', description: res.reason, variant: 'destructive' });
      return false;
    }
    setAppliedCoupon(res.coupon);
    toast({ title: `Cupom ${res.coupon.code} aplicado!`, description: `${res.coupon.discount_percent}% de desconto` });
    return true;
  }, [toast]);

  const handleRemoveCoupon = useCallback(() => setAppliedCoupon(null), []);

  const handleAddCustomDrink = useCallback((drink: CustomDrink) => {
    setPdvCustomDrinks(prev => [...prev, drink]);
    rememberRecentDrink(drink);
    toast({ title: `${drink.name} adicionado!` });
  }, [toast, setPdvCustomDrinks]);

  const handleRemoveCustomDrink = useCallback((drinkId: string) => {
    setPdvCustomDrinks(prev => prev.filter(d => d.id !== drinkId));
  }, [setPdvCustomDrinks]);

  const handleAddLooseCigarettes = useCallback((items: LooseCigaretteSelection[]) => {
    if (!items.length) return;
    const newDrinks: CustomDrink[] = items.map(it => {
      const unitPrice = parseNumeric(it.unitPrice);
      return {
        id: `loose-cig-${it.packId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: buildLooseCigaretteItemName(it.packId, it.productName),
        description: `Cigarro solto unitário (R$ ${unitPrice.toFixed(2).replace('.', ',')}/un)`,
        totalPrice: unitPrice,
        quantity: it.quantity,
        doses: [],
        fruits: [],
        gelo: null,
        energetico: null,
      } as unknown as CustomDrink;
    });
    setPdvCustomDrinks(prev => [...prev, ...newDrinks]);
    const totalUnits = items.reduce((s, it) => s + it.quantity, 0);
    toast({ title: `🚬 ${totalUnits} cigarro(s) solto(s) adicionado(s)` });
  }, [setPdvCustomDrinks, toast]);

  // Decrement open_packs after order is created (FIFO via sell_loose_cigarette RPC).
  // Surfaces errors via toast so operator notices stock issues — even though the order
  // already exists at this point, the cigarette stock must remain consistent.
  const consumeLooseCigarettesFromCart = useCallback(async (orderId: string | null, drinks: CustomDrink[]) => {
    const looseItems = drinks
      .map(d => {
        const packId = parseLooseCigarettePackId(d.name);
        if (!packId) return null;
        return { packId, quantity: d.quantity || 1 };
      })
      .filter((x): x is { packId: string; quantity: number } => x !== null);
    if (!looseItems.length) return;
    const failures: string[] = [];
    for (const it of looseItems) {
      try {
        const { error } = await supabase.rpc('sell_loose_cigarette', {
          p_pack_id: it.packId,
          p_quantity: it.quantity,
        });
        if (error) {
          console.error('[PDV] sell_loose_cigarette failed', it, error);
          failures.push(error.message || 'falha ao decrementar maço');
        }
      } catch (err) {
        console.error('[PDV] sell_loose_cigarette exception', it, err);
        failures.push((err as Error)?.message || 'exceção ao decrementar maço');
      }
    }
    if (failures.length > 0) {
      toast({
        title: '⚠️ Atenção: estoque de cigarros soltos não atualizado',
        description: `Pedido foi criado, mas houve ${failures.length} falha(s) ao decrementar os maços. Verifique manualmente: ${failures[0]}`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleSelectDrinkType = useCallback((typeId: string) => {
    if (typeId === 'caipirinha') {
      setCaipirinhaOpen(true);
    } else if (typeId === 'copao') {
      setCopaoOpen(true);
    } else if (typeId === 'caipi-ice') {
      setCaipiIceOpen(true);
    } else {
      setSelectedDrinkType(typeId);
      setCustomDrinkOpen(true);
    }
  }, []);

  // Handler para modais que adicionam produtos regulares ao carrinho do PDV
  const handleAddItemToPdv = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
    toast({ title: `${product.name} adicionado!` });
  }, [toast, setCart]);

  /**
   * ATÔMICO: adiciona cada componente do combo como item REAL no carrinho do PDV.
   * Cada item carrega o product_id verdadeiro, então ao finalizar a venda o trigger
   * trg_deduct_stock_on_order_item baixa o estoque de spirit, energético/latas e gelos.
   * O preço unitário já vem com o desconto do combo rateado.
   */
  const handleAddComboComponentsToPdv = useCallback(
    (parts: Array<{ product: Product; quantity: number; unitPrice: number }>, comboLabel: string) => {
      setCart(prev => {
        const next = [...prev];
        for (const p of parts) {
          // Cria uma cópia do produto com salePrice ajustado (preço do combo), preservando o ID real
          const adjusted: Product = { ...p.product, salePrice: p.unitPrice.toFixed(2) };
          // NÃO mescla com itens existentes — cada componente do combo é uma linha própria
          next.push({ product: adjusted, quantity: p.quantity });
        }
        return next;
      });
      toast({ title: 'Combo adicionado!', description: comboLabel });
    },
    [toast, setCart],
  );


  // Early returns after all hooks
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const handleFinalizeSale = () => {
    if (cart.length === 0 && pdvCustomDrinks.length === 0) {
      toast({ title: 'Carrinho vazio', variant: 'destructive' });
      return;
    }
    setIsPaymentDialogOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!paymentMethod) {
      toast({ title: 'Selecione um método de pagamento', variant: 'destructive' });
      return;
    }

    // PIX: NÃO criar pedido ainda — apenas guardar payload e abrir QR Code.
    // O pedido só será inserido após o MP confirmar o pagamento (handlePixPaymentApproved).
    if (paymentMethod === 'pix') {
      const order = {
        user_id: user?.id || null,
        order_type: 'counter' as const,
        status: 'accepted' as const,
        subtotal: Number(orderSubtotal.toFixed(2)),
        delivery_fee: 0,
        discount: Number(discountValue.toFixed(2)),
        total: Number(total.toFixed(2)),
        payment_method: paymentMethod,
        change_for: null,
        notes: notes || null,
        customer_name: pdvCustomerName,
        salesperson: null,
      };

      const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      const items: PdvOrderItemPayload[] = [
        ...cart.map(item => ({
          product_id: isValidUUID(item.product.id) ? item.product.id : null,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: parseNumeric(item.product.salePrice),
          total_price: parseNumeric(item.product.salePrice) * item.quantity,
        })),
        ...pdvCustomDrinks.flatMap(drink => {
          const fallback = buildCustomDrinkProductName(drink.name, drink.description);
          const isCig = !!parseLooseCigarettePackId(drink.name);
          if (isCig || !isRecipeDrink(drink as any)) {
            return [{
              product_id: null as string | null,
              product_name: fallback,
              quantity: drink.quantity || 1,
              unit_price: parseNumeric(drink.totalPrice),
              total_price: parseNumeric(drink.totalPrice) * (drink.quantity || 1),
              is_wizard_item: !isCig,
            }];
          }
          return explodeCopaoToOrderItems(drink as any).map(it => ({
            ...it,
            unit_price: parseNumeric(it.unit_price),
            total_price: parseNumeric(it.total_price),
          }));
        }),
      ];
      const surchargeItemPix = buildSurchargeItem(surchargeValue);
      if (surchargeItemPix) items.push(surchargeItemPix);

      if (!items.length) {
        toast({ title: 'Carrinho vazio', description: 'Adicione produtos antes de cobrar.', variant: 'destructive' });
        return;
      }

      const tempRef = crypto.randomUUID();
      setPendingPixPayload({ order, items, tempRef });
      setPendingOrderId(null); // garante que nenhum pedido pré-existente vaze
      setCompositePixAmount(null); // PIX puro cobra o TOTAL da venda; limpa valor de pagamento composto anterior
      setIsPaymentDialogOpen(false);
      setShowPixModal(true);
      return;
    }

    // For other payment methods, proceed normally.
    // Clear any leftover composite PIX amount so the QR modal is not reopened.
    setCompositePixAmount(null);
    const order = {
      user_id: user?.id || null,
      order_type: 'counter' as const,
      status: 'accepted' as const,
      subtotal: Number(orderSubtotal.toFixed(2)),
      delivery_fee: 0,
      discount: Number(discountValue.toFixed(2)),
      total: Number(total.toFixed(2)),
      payment_method: paymentMethod,
      change_for: paymentMethod === 'cash' && changeFor ? Number(changeFor) : null,
      notes: notes || null,
      customer_name: pdvCustomerName,
      salesperson: null,
    };

    console.log('Creating PDV order:', order);

    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const items: PdvOrderItemPayload[] = [
      ...cart.map(item => ({
        product_id: isValidUUID(item.product.id) ? item.product.id : null,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: parseNumeric(item.product.salePrice),
        total_price: parseNumeric(item.product.salePrice) * item.quantity,
      })),
      ...pdvCustomDrinks.flatMap(drink => {
        const fallback = buildCustomDrinkProductName(drink.name, drink.description);
        const isCig = !!parseLooseCigarettePackId(drink.name);
        if (isCig || !isRecipeDrink(drink as any)) {
          return [{
            product_id: null as string | null,
            product_name: fallback,
            quantity: drink.quantity || 1,
            unit_price: parseNumeric(drink.totalPrice),
            total_price: parseNumeric(drink.totalPrice) * (drink.quantity || 1),
            is_wizard_item: !isCig,
          }];
        }
        return explodeCopaoToOrderItems(drink as any).map(it => ({
          ...it,
          unit_price: parseNumeric(it.unit_price),
          total_price: parseNumeric(it.total_price),
        }));
      }),
    ];
    const surchargeItemNormal = buildSurchargeItem(surchargeValue);
    if (surchargeItemNormal) items.push(surchargeItemNormal);

    createOrderMutation.mutate({ order, items });
  };

  const handlePixPaymentApproved = async (mpPaymentId?: string) => {
    // Pagamento composto: pedido já foi criado por outro fluxo, apenas finaliza
    if (compositePixAmount !== null) {
      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: '✅ Pagamento PIX confirmado!', description: 'Comprovante registrado com sucesso.' });
      setCart([]);
      setPdvCustomDrinks([]);
      setNotes('');
      setPaymentMethod(null);
      setChangeFor('');
      setCustomerName('');
      setManualDiscount(''); setManualSurcharge('');
      void finalizeAppliedCoupon();
      setShowPixModal(false);
      setPendingOrderId(null);
      setCompositePixAmount(null);
      setIsCartOpen(false);
      return;
    }

    // PIX puro: criar o pedido AGORA, após confirmação do MP
    if (!pendingPixPayload) {
      toast({ title: 'Pedido não encontrado', description: 'Tente novamente.', variant: 'destructive' });
      setShowPixModal(false);
      return;
    }

      const { order, items } = pendingPixPayload;
    const noteWithMp = mpPaymentId ? `✅ PIX PAGO - MP #${mpPaymentId}` : (order.notes as string | null);

    try {
      const normalizedOrder = {
        ...(order as PdvOrderPayload['order']),
        notes: noteWithMp ?? null,
      };
      const rpcPayload = buildCounterOrderRpcPayload(normalizedOrder, items);

      // rpcPayload sends explicit `null` for optional args (required by PostgREST overload
      // resolution — see Checkout.tsx), which the generated RPC arg types don't allow.
      const { data: orderId, error: orderError } = await supabase.rpc('create_counter_order_with_items', rpcPayload as any);

      if (orderError || !orderId) {
        console.error('[PDV PIX] RPC failed after PIX approved:', orderError);
        throw new Error(orderError?.message || 'Falha ao registrar pedido após pagamento PIX');
      }

      const createdOrderId = orderId as string;
      // Marca o mp_payment_id no pedido recém-criado
      if (mpPaymentId) {
        await supabase
          .from('orders')
          .update({
            mp_payment_id: mpPaymentId,
            payment_confirmed: true,
            payment_confirmed_at: new Date().toISOString(),
            payment_confirmed_by: 'Mercado Pago (PIX)',
          })
          .eq('id', createdOrderId);
      }

      // Decrement open_packs for any loose-cigarette items in the cart
      try {
        await consumeLooseCigarettesFromCart(createdOrderId, pdvCustomDrinks);
      } catch (err) {
        console.warn('[PDV PIX] Falha ao decrementar maços abertos:', err);
      }

      queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      void playCashRegisterSound(0.7);
      toast({ title: '✅ Pagamento PIX confirmado!', description: 'Pedido registrado com sucesso.' });
      setCart([]);
      setPdvCustomDrinks([]);
      setNotes('');
      setPaymentMethod(null);
      setChangeFor('');
      setCustomerName('');
      setManualDiscount(''); setManualSurcharge('');
      void finalizeAppliedCoupon();
      setShowPixModal(false);
      setPendingOrderId(null);
      setPendingPixPayload(null);
      setCompositePixAmount(null);
      setIsCartOpen(false);
    } catch (err: any) {
      console.error('[PDV PIX] Critical error creating order after PIX approval:', err);
      toast({
        title: '⚠️ PIX confirmado mas erro ao salvar pedido',
        description: `MP #${mpPaymentId || 's/n'} — ${err?.message || 'Contate o suporte'}`,
        variant: 'destructive',
      });
    }
  };

  const handlePixPaymentCancelled = async () => {
    // PIX puro: nenhum pedido foi criado, apenas limpa o estado
    // (Composto: pedido já existe, mas cancelamento de PIX não deve apagar)
    setPendingPixPayload(null);
    setPendingOrderId(null);
    setShowPixModal(false);
    setCompositePixAmount(null);
  };


  const handleCompositePayment = (splits: PaymentSplit[], compositeNotes: string) => {
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    
    // Track PIX amount for QR code display.
    // IMPORTANT: sum ALL pix splits (operator may add more than one) so the
    // QR Code charges the full PIX portion, never just the first entry.
    const pixTotal = splits
      .filter(s => s.method === 'pix')
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const pixRounded = Number(pixTotal.toFixed(2));
    setCompositePixAmount(pixRounded > 0 ? pixRounded : null);
    
    const order = {
      user_id: user?.id || null,
      order_type: 'counter' as const,
      status: 'accepted' as const,
      subtotal: Number(orderSubtotal.toFixed(2)),
      delivery_fee: 0,
      discount: Number(discountValue.toFixed(2)),
      total: Number(total.toFixed(2)),
      payment_method: (splits.length === 1 ? splits[0].method : 'mixed') as PaymentMethod,
      change_for: null,
      notes: [notes, compositeNotes].filter(Boolean).join(' | '),
      customer_name: pdvCustomerName,
      salesperson: null,
    };

    const items: PdvOrderItemPayload[] = [
      ...cart.map(item => ({
        product_id: isValidUUID(item.product.id) ? item.product.id : null,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: Number(item.product.salePrice),
        total_price: Number(item.product.salePrice) * item.quantity,
      })),
      ...pdvCustomDrinks.flatMap(drink => {
        const fallback = buildCustomDrinkProductName(drink.name, drink.description);
        const isCig = !!parseLooseCigarettePackId(drink.name);
        if (isCig || !isRecipeDrink(drink as any)) {
          return [{
            product_id: null as string | null,
            product_name: fallback,
            quantity: drink.quantity || 1,
            unit_price: Number(drink.totalPrice),
            total_price: Number(drink.totalPrice) * (drink.quantity || 1),
            is_wizard_item: !isCig,
          }];
        }
        return explodeCopaoToOrderItems(drink as any);
      }),
    ];
    const surchargeItemComposite = buildSurchargeItem(surchargeValue);
    if (surchargeItemComposite) items.push(surchargeItemComposite);

    setShowCompositePayment(false);
    setIsPaymentDialogOpen(false);
    createOrderMutation.mutate({ order, items });
  };

  const paymentMethods: { id: PaymentMethod; label: string; icon: any }[] = [
    { id: 'cash', label: 'Dinheiro', icon: Banknote },
    { id: 'pix', label: 'PIX', icon: QrCode },
    { id: 'pix_pos', label: 'PIX POS', icon: QrCode },
    { id: 'card_debit', label: 'Débito', icon: CreditCard },
    { id: 'card_credit', label: 'Crédito', icon: CreditCard },
  ];

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = 200;
      categoryScrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Show loading while checking auth
  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="h-screen-safe bg-background flex flex-col overflow-hidden">
      <header className="bg-[#0A0A0A] border-b border-[#D4AF37]/30 py-3 px-3 md:px-6 flex items-center justify-between sticky top-0 z-50 flex-shrink-0">
        <PanelSwitcher current="pdv" />
        <div className="flex items-center gap-2 md:gap-4">
          <StoreStatusToggle />
          <span className="text-white/70 text-xs sm:text-sm hidden sm:inline">
            {user?.name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-primary-foreground/10"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Draft tabs - Chrome-like */}
      <DraftTabs
        tabs={draftTabs}
        activeId={activeDraftId}
        onSelect={setActiveDraftId}
        onAdd={handleAddDraft}
        onRemove={handleRemoveDraft}
      />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
            

            {/* Search bar with barcode detection + control buttons */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder={continuousMode ? "Scaneie o código de barras..." : "Buscar produto ou scanear código..."}
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyDown}
                  className={`pl-9 bg-secondary border-primary/30 text-sm ${continuousMode ? 'border-green-500 ring-1 ring-green-500/50' : ''}`}
                  data-testid="input-search-product"
                  autoFocus={!isMobile}
                />
              </div>
              
              {/* Continuous Mode Toggle */}
              <Button
                variant={continuousMode ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setContinuousMode(!continuousMode);
                  if (!continuousMode) {
                    searchInputRef.current?.focus();
                  }
                }}
                className={`gap-1.5 whitespace-nowrap ${continuousMode ? 'bg-green-600 hover:bg-green-700' : ''}`}
              >
                <ScanLine className="h-4 w-4" />
                <span className="hidden sm:inline">{continuousMode ? 'Contínuo ON' : 'Contínuo'}</span>
              </Button>
              
              {/* Camera Toggle */}
              <Button
                variant={cameraActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  if (!cameraActive) setCameraScannerMounted(true);
                  setCameraActive(!cameraActive);
                }}
                className={`gap-1.5 ${cameraActive ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              >
                <Camera className="h-4 w-4" />
                <span className="hidden sm:inline">{cameraActive ? 'Câmera ON' : 'Câmera'}</span>
              </Button>

              {/* Voice order (AI) */}
              <VoiceOrderButton products={products} onAddItem={handleAddItemToPdv} />

              {/* Últimos drinks montados — repete receita rapidamente */}
              <RecentDrinksButton onAddCustomDrink={handleAddCustomDrink} />
            </div>

            {/* Scanner de câmera: carregado só quando solicitado para não travar a abertura do PDV mobile */}
            {cameraScannerMounted && (
              <Suspense fallback={cameraActive ? <div className="text-xs text-muted-foreground px-2">Abrindo câmera…</div> : null}>
                <PDVCameraScanner
                  onScan={(barcode) => {
                    handleBarcodeScan(barcode);
                  }}
                  isActive={cameraActive}
                  onClose={() => setCameraActive(false)}
                />
              </Suspense>
            )}

            <div className="relative flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => scrollCategories('left')}
                data-testid="button-scroll-left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <div 
                ref={categoryScrollRef}
                className="flex gap-1.5 overflow-x-auto flex-1 scroll-smooth"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {categories.map((cat) => (
                  <Button
                    key={cat.id}
                    variant={selectedCategory === cat.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                    className="flex-shrink-0 whitespace-nowrap text-xs px-3"
                    data-testid={`button-category-${cat.id}`}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => scrollCategories('right')}
                data-testid="button-scroll-right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Monte seu Drink */}
            <SpecialDrinksCarousel onSelectType={handleSelectDrinkType} />

            {/* Banners de Funcionalidades */}
            <FeatureBannerCarousel
              onComboOpen={() => setComboOpen(true)}
              onSpecialDrinksOpen={() => setSpecialDrinksOpen(true)}
            />
          </div>

          <div className="flex-1 overflow-auto p-2 sm:p-3 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {visibleProducts.map((product) => {
                const infinite = isInfiniteStock(product);
                const isOutOfStock = !infinite && product.stock <= 0;
                return (
                  <Card
                    key={product.id}
                    className={`cursor-pointer hover-elevate active-elevate-2 ${isOutOfStock ? 'opacity-50' : ''}`}
                    onClick={() => !isOutOfStock && addToCart(product)}
                    data-testid={`card-product-${product.id}`}
                  >
                    <CardContent className="p-2 sm:p-3">
                      <div className="aspect-square w-full mb-2 rounded-md overflow-hidden bg-secondary/40 flex items-center justify-center">
                        {product.imageUrl ? (
                          <SmartImage
                            path={product.imageUrl}
                            widths={W_CARD}
                            sizes="(max-width: 640px) 25vw, 120px"
                            alt={product.name}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <Wine className="w-6 h-6 text-primary/40" />
                        )}
                      </div>
                      <h3 className="font-medium text-xs sm:text-sm mb-1 line-clamp-2 min-h-[2rem]">{product.name}</h3>
                      <p className="text-primary font-bold text-sm sm:text-base">{formatCurrency(product.salePrice)}</p>
                      {infinite ? (
                        <Badge variant="default" className="mt-1 text-xs bg-green-600">
                          Disponivel
                        </Badge>
                      ) : isOutOfStock ? (
                        <Badge variant="destructive" className="mt-1 text-xs">
                          Esgotado
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          {product.stock}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {filteredProducts.length > visibleProducts.length && (
              <div className="py-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setVisibleProductLimit((limit) => limit + 80)}
                >
                  Mostrar mais {Math.min(80, filteredProducts.length - visibleProducts.length)}
                </Button>
              </div>
            )}
          </div>
        </main>

        <aside className="hidden lg:flex w-80 xl:w-96 bg-card border-l border-border flex-col">
          <CartContent
            cart={cart}
            customDrinks={pdvCustomDrinks}
            customDrinksTotal={customDrinksTotal}
            notes={notes}
            manualDiscount={manualDiscount}
            discountValue={discountValue}
            subtotal={subtotal}
            total={total}
            beerDiscount={pdvBeerDiscount}
            promotionDiscount={pdvPromotionDiscount}
            promotionLabel={pdvPromotionLabel}
            onNoteChange={handleNoteChange}
            onDiscountChange={handleDiscountChange}
            manualSurcharge={manualSurcharge}
            surchargeValue={surchargeValue}
            onSurchargeChange={handleSurchargeChange}
            onRemoveFromCart={removeFromCart}
            onUpdateQuantity={updateQuantity}
            onRemoveCustomDrink={handleRemoveCustomDrink}
            onFinalizeSale={handleFinalizeSale}
            onSaqDepClick={() => setShowSaqDepModal(true)}
            

            onCadernetaClick={() => setShowCadernetaModal(true)}
            onCigaretteClick={() => setShowCigaretteModal(true)}
            appliedCoupon={appliedCoupon}
            couponDiscount={couponDiscount}
            onApplyCoupon={handleApplyCoupon}
            onRemoveCoupon={handleRemoveCoupon}
          />
        </aside>
      </div>

      {/* Mobile cart: painel interno fixo (SEM Sheet/Portal) — evita bugs de teclado/overlay no iPhone */}
      {isCartOpen && (
        <div
          className="lg:hidden fixed left-0 right-0 z-50 flex flex-col bg-background"
          style={{
            top: 0,
            height: vvHeight > 0 ? `${vvHeight}px` : '100dvh',
            maxHeight: vvHeight > 0 ? `${vvHeight}px` : '100dvh',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between p-3 border-b shrink-0 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2 min-w-0">
              <ShoppingCart className="h-5 w-5 shrink-0" />
              <span className="font-semibold truncate">Carrinho ({cartItemCount})</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0"
              onClick={() => {
                const el = document.activeElement as HTMLElement | null;
                el?.blur?.();
                setIsCartOpen(false);
              }}
              data-testid="button-close-cart"
            >
              Continuar lançando
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <CartContent
              cart={cart}
              customDrinks={pdvCustomDrinks}
              customDrinksTotal={customDrinksTotal}
              notes={notes}
              manualDiscount={manualDiscount}
              discountValue={discountValue}
              subtotal={subtotal}
              total={total}
              beerDiscount={pdvBeerDiscount}
              promotionDiscount={pdvPromotionDiscount}
              promotionLabel={pdvPromotionLabel}
              onNoteChange={handleNoteChange}
              onDiscountChange={handleDiscountChange}
              manualSurcharge={manualSurcharge}
              surchargeValue={surchargeValue}
              onSurchargeChange={handleSurchargeChange}
              onRemoveFromCart={removeFromCart}
              onUpdateQuantity={updateQuantity}
              onRemoveCustomDrink={handleRemoveCustomDrink}
              onFinalizeSale={handleFinalizeSale}
              onSaqDepClick={() => setShowSaqDepModal(true)}
              
              onCadernetaClick={() => setShowCadernetaModal(true)}
              onCigaretteClick={() => setShowCigaretteModal(true)}
              appliedCoupon={appliedCoupon}
              couponDiscount={couponDiscount}
              onApplyCoupon={handleApplyCoupon}
              onRemoveCoupon={handleRemoveCoupon}
            />
          </div>
        </div>
      )}

      {/* Botão flutuante para abrir o carrinho mobile */}
      <div
        className="lg:hidden fixed z-40"
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', right: '16px' }}
      >
        <Button
          size="icon"
          onClick={() => setIsCartOpen(true)}
          className="h-14 w-14 aspect-square rounded-full shadow-lg relative p-0 shrink-0"
          data-testid="button-open-cart"
        >
          <ShoppingCart className="h-6 w-6" />
          {cartItemCount > 0 && (
            <span className="pointer-events-none absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center border-2 border-background">
              {cartItemCount > 99 ? '99+' : cartItemCount}
            </span>
          )}
        </Button>
      </div>

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-sm sm:max-w-md mx-2">
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl">Pagamento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-center py-3 bg-secondary rounded-lg">
              <p className="text-muted-foreground text-xs sm:text-sm">Total a Pagar</p>
              <p className="text-3xl sm:text-4xl font-bold text-primary">{formatCurrency(total)}</p>
            </div>

            <div>
              <Label htmlFor="customerName" className="mb-2 block text-sm font-semibold">
                Nome do Cliente <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <CustomerNameInput
                id="customerName"
                value={customerName}
                onChange={setCustomerName}
                placeholder="Ex: JOÃO"
              />
            </div>


            <div>
              <Label className="mb-2 block text-sm">Forma de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.id}
                    variant={paymentMethod === method.id ? 'default' : 'outline'}
                    className="h-14 sm:h-16 flex-col gap-1"
                    onClick={() => setPaymentMethod(method.id)}
                    data-testid={`button-payment-${method.id}`}
                  >
                    <method.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="text-xs">{method.label}</span>
                  </Button>
                ))}
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-3 rounded-lg border-2 border-primary/30 bg-secondary/40 p-3">
                <div>
                  <Label htmlFor="changeFor" className="text-sm font-semibold">
                    Valor recebido do cliente
                  </Label>
                  <CurrencyInput
                    id="changeFor"
                    value={changeFor}
                    onChange={(v) => setChangeFor(String(v))}
                    placeholder="0,00"
                    className="bg-background border-primary/40 text-lg font-bold mt-1"
                    data-testid="input-change-for"
                  />
                </div>

                {changeFor && parseFloat(changeFor) > 0 && (
                  <div className="rounded-md bg-background/80 p-3 border border-border">
                    {parseFloat(changeFor) < total ? (
                      <div className="flex items-center justify-between text-destructive">
                        <span className="text-sm font-medium">Valor insuficiente</span>
                        <span className="text-base font-bold">
                          Faltam {formatCurrency(total - parseFloat(changeFor))}
                        </span>
                      </div>
                    ) : change === 0 ? (
                      <div className="flex items-center justify-between text-foreground">
                        <span className="text-sm font-medium">Valor exato</span>
                        <span className="text-base font-bold">Sem troco</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Troco a devolver
                        </span>
                        <span className="text-2xl font-extrabold text-green-500">
                          {formatCurrency(change)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <Button
              className="w-full py-5 text-base"
              disabled={
                !paymentMethod ||
                createOrderMutation.isPending ||
                (paymentMethod === 'cash' && !!changeFor && parseFloat(changeFor) > 0 && parseFloat(changeFor) < total)
              }
              onClick={handleConfirmPayment}
              data-testid="button-confirm-payment"
            >
              {createOrderMutation.isPending ? 'Processando...' : 'Finalizar Venda'}
            </Button>

            <div className="relative flex items-center gap-2 pt-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Button
              variant="outline"
              className="w-full py-4 text-sm border-primary/50 text-primary hover:bg-primary/10"
              onClick={() => {
                setIsPaymentDialogOpen(false);
                setShowCompositePayment(true);
              }}
            >
              <Layers className="h-4 w-4 mr-2" />
              Pagamento Composto (dividir conta)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!stockAlertProduct} onOpenChange={() => setStockAlertProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Estoque Insuficiente
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-base">
              O produto <strong>{stockAlertProduct?.name}</strong> está com estoque zerado ou você já adicionou a quantidade máxima disponível ({stockAlertProduct?.stock ?? 0} unidades).
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStockAlertProduct(null)} data-testid="button-close-stock-alert">
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lazy modals — only mount when actually needed */}
      <Suspense fallback={null}>
        {showPixModal && (
          <PixQRCodeModal
            open={showPixModal}
            onOpenChange={setShowPixModal}
            amount={compositePixAmount || total}
            description={`PDV - Pedido Caixa`}
            orderId={pendingOrderId || ''}
            referenceId={pendingPixPayload?.tempRef || pendingOrderId || ''}
            onPaymentApproved={handlePixPaymentApproved}
            onPaymentCancelled={handlePixPaymentCancelled}
            successSound="cash-register"
          />
        )}
        {showSaqDepModal && (
          <SaqDepModal open={showSaqDepModal} onOpenChange={setShowSaqDepModal} />
        )}


        {showCadernetaModal && (
          <CadernetaModal
            open={showCadernetaModal}
            onOpenChange={setShowCadernetaModal}
            cart={cart}
            customDrinks={surchargeValue > 0 ? [
              ...pdvCustomDrinks,
              {
                id: `surcharge-${Date.now()}`,
                type: 'custom_drink' as const,
                name: 'ACRÉSCIMO MANUAL',
                description: 'Acréscimo manual lançado no PDV',
                doses: [],
                energetico: null,
                fruits: [],
                gelo: null,
                totalPrice: surchargeValue,
                quantity: 1,
              },
            ] : pdvCustomDrinks}
            total={total}
            onSuccess={() => {
              setCart([]);
              setPdvCustomDrinks([]);
              setNotes('');
              setCustomerName('');
              setManualDiscount(''); setManualSurcharge('');
              void finalizeAppliedCoupon();
              setIsCartOpen(false);
              queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
            }}
          />
        )}
      </Suspense>

      {/* Print Ticket Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Imprimir Ticket?
            </DialogTitle>
            <DialogDescription>
              Deseja imprimir o comprovante desta venda?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPrintDialog(false);
                setLastOrderForPrint(null);
              }}
            >
              Não
            </Button>
            <Button
              onClick={() => {
                if (lastOrderForPrint) {
                  printOrderTicket(lastOrderForPrint);
                }
                setShowPrintDialog(false);
                setLastOrderForPrint(null);
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        {customDrinkOpen && (
          <CustomDrinkModal
            open={customDrinkOpen}
            onOpenChange={setCustomDrinkOpen}
            drinkType={selectedDrinkType}
            onAddCustomDrink={handleAddCustomDrink}
          />
        )}
        {caipirinhaOpen && (
          <CaipirinhaModal open={caipirinhaOpen} onOpenChange={setCaipirinhaOpen} onAddCustomDrink={handleAddCustomDrink} />
        )}
        {copaoOpen && (
          <CopaoModal open={copaoOpen} onOpenChange={setCopaoOpen} onAddCustomDrink={handleAddCustomDrink} />
        )}
        {caipiIceOpen && (
          <CaipiIceModal open={caipiIceOpen} onOpenChange={setCaipiIceOpen} onAddCustomDrink={handleAddCustomDrink} />
        )}
        {comboOpen && (
          <ComboModal
            open={comboOpen}
            onOpenChange={setComboOpen}
            onAddComboComponents={handleAddComboComponentsToPdv}
          />
        )}
        {specialDrinksOpen && (
          <SpecialDrinksModal open={specialDrinksOpen} onOpenChange={setSpecialDrinksOpen} onAddItem={handleAddItemToPdv} />
        )}
        {premiumDrinksOpen && (
          <PremiumDrinksModal open={premiumDrinksOpen} onOpenChange={setPremiumDrinksOpen} onAddItem={handleAddItemToPdv} />
        )}
        {showCompositePayment && (
          <CompositePaymentModal
            open={showCompositePayment}
            onOpenChange={setShowCompositePayment}
            total={total}
            onConfirm={handleCompositePayment}
            isPending={createOrderMutation.isPending}
          />
        )}
        {showPixPosProofModal && (
          <PixPosProofModal
            open={showPixPosProofModal}
            onOpenChange={setShowPixPosProofModal}
            orderId={pixPosProofOrderId || ''}
            totalValue={total}
            onConfirmed={() => {
              queryClient.invalidateQueries({ queryKey: ['pdv-products'] });
              queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
              setPixPosProofOrderId(null);
            }}
          />
        )}
        {showCigaretteModal && (
          <LooseCigaretteSelector
            open={showCigaretteModal}
            onOpenChange={setShowCigaretteModal}
            onConfirm={handleAddLooseCigarettes}
          />
        )}
      </Suspense>
    </div>
  );
}
