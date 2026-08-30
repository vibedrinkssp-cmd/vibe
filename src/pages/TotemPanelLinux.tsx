import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { normalizeSearch } from '@/lib/text-utils';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, QrCode, X, Search, ChevronLeft, CheckCircle2, Store, Wine, Gift, Leaf, Cookie, Sandwich, Flame, Loader2, HelpCircle, ChevronRight, Settings } from 'lucide-react';
import { TotemPrintTicketsModal } from '@/components/totem/TotemPrintTicketsModal';
import totemLogo from '@/assets/totem-logo.gif';
import { motion, AnimatePresence } from 'framer-motion';

// Disable framer-motion layout animations globally for totem performance
const noLayoutMotion = { layout: false } as const;
import { useMutation, useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth';
import { staffLogin } from '@/lib/customer-auth';
import { supabase } from '@/integrations/supabase/client-safe';
import { usePublicProducts, usePublicCategories } from '@/hooks/use-public-data';
import { ensureImageUrl } from '@/lib/supabase';
import { SpecialDrinksModal } from '@/components/home/SpecialDrinksModal';
import { useMercadoPago } from '@/hooks/use-mercadopago';
import { ComboModal } from '@/components/home/ComboModal';
import { NaturalLunchModal } from '@/components/home/NaturalLunchModal';
import { SalgadoComboModal } from '@/components/home/SalgadoComboModal';
import { HamburgerComboModal } from '@/components/home/HamburgerComboModal';
import { CustomDrinkModal } from '@/components/home/CustomDrinkModal';
import { CaipirinhaModal } from '@/components/home/CaipirinhaModal';
import { CopaoModal } from '@/components/home/CopaoModal';
import { CaipiIceModal } from '@/components/home/CaipiIceModal';
import { getCategoryIcon } from '@/lib/category-icons';
import { useProductsRealtime } from '@/hooks/use-realtime-sync';
import type { Product, PaymentMethod, CustomDrink } from '@/shared/schema';
import { getNameSuggestions, rememberCustomerName } from '@/lib/totem-name-autocomplete';
import { printTotemTicket } from '@/lib/totem-print-linux';

const DRINK_DEFAULT_IMAGES: Record<string, string> = {
  batida: '/assets/drinks/batida.webp',
  caipirinha: '/assets/drinks/caipirinha.webp',
  'caipi-ice': '/assets/drinks/caipi-ice.webp',
  dose: '/assets/drinks/dose.webp',
  'drink-43': '/assets/drinks/drink-43.webp',
  copao: '/assets/drinks/copao.webp',
};

// ── Unified Totem Header ──
function TotemHeader({ 
  title, 
  onBack, 
  rightContent 
}: { 
  title: string; 
  onBack?: () => void; 
  rightContent?: React.ReactNode;
}) {
  return (
    <div className="flex-shrink-0 bg-white px-4 flex items-center justify-between" style={{ height: '90px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
      <div className="flex items-center gap-3 min-w-[80px]">
        {onBack && (
          <button onClick={onBack}
            className="p-3 rounded-2xl bg-primary/10 text-primary">
            <ChevronLeft className="w-7 h-7" />
          </button>
        )}
        <img src={totemLogo} alt="VM" className="h-16 w-auto" />
      </div>
      <h1 className="text-xl font-black text-primary uppercase tracking-wide">{title}</h1>
      <div className="min-w-[80px] flex justify-end">
        {rightContent}
      </div>
    </div>
  );
}

// ── Totem Login ──
function TotemLogin({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await staffLogin(user, pass);
      if (!result.success) { setError(result.error || 'Credenciais inválidas'); return; }
      const userData = result.user!;
      login({ id: userData.id, name: userData.name, whatsapp: userData.whatsapp, role: userData.role }, 'pdv', result.sessionToken);
      onLogin();
    } catch { setError('Erro ao autenticar'); } finally { setLoading(false); }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-[hsl(263,78%,12%)] via-[hsl(263,78%,20%)] to-[hsl(280,60%,15%)] overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[hsl(263,70%,25%)]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[hsl(280,50%,20%)]" />
      </div>
      <div className="bg-[hsl(263,60%,18%)] rounded-[2.5rem] p-10 shadow-2xl w-full max-w-md mx-6 space-y-8 border border-white/20 z-10">
        <div className="text-center space-y-4">
          <img
            src={totemLogo}
            alt="Vibe Drinks"
            className="h-28 w-auto mx-auto"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <h1 className="text-white text-2xl font-black tracking-wide">VIBE DRINKS</h1>
          <p className="text-white/60 text-sm">Totem de Autoatendimento</p>
          <p className="text-white/60 text-sm">Acesso do operador</p>
        </div>
        <div className="space-y-4">
          <Input placeholder="Usuário" value={user} onChange={e => setUser(e.target.value)} className="h-14 text-lg text-center rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-white/40" />
          <Input type="password" placeholder="Senha" value={pass} onChange={e => setPass(e.target.value)} className="h-14 text-lg text-center rounded-2xl bg-white/10 border-white/20 text-white placeholder:text-white/40" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {error && <p className="text-destructive text-center font-bold">{error}</p>}
          <button onClick={handleLogin} disabled={loading || !user || !pass} className="w-full h-14 text-xl font-black rounded-2xl bg-white/15 text-white shadow-xl border border-white/20 disabled:opacity-40 hover:bg-white/20 transition-colors active:scale-95">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface TotemCartItem { product: Product; quantity: number; cartLineId?: string; }
interface TotemCustomDrink extends CustomDrink {}

// ── Feature Banner Images ──
const FEATURE_IMAGES: Record<string, string> = {
  'special-drinks': 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=400&h=200&fit=crop&q=60',
  'combo': 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=200&fit=crop&q=60',
  'natural-lunch': 'https://images.unsplash.com/photo-1540914124281-342587941389?w=400&h=200&fit=crop&q=60',
  'salgado-combo': 'https://images.unsplash.com/photo-1604467715878-83e57e8bc129?w=400&h=200&fit=crop&q=60',
  'hamburger-combo': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=200&fit=crop&q=60',
};

// ── Main Totem ──
const KEYBOARD_ROWS: string[][] = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M'],
];

function TotemKiosk() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [cart, setCart] = useState<TotemCartItem[]>([]);
  const [customDrinks, setCustomDrinks] = useState<TotemCustomDrink[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCashChange, setShowCashChange] = useState(false);
  const [changeForValue, setChangeForValue] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [addedProductId, setAddedProductId] = useState<string | null>(null);
  const [showPixScreen, setShowPixScreen] = useState(false);
  const [pixTempRef, setPixTempRef] = useState<string | null>(null);
  const mp = useMercadoPago();
  const [showKeyboard, setShowKeyboard] = useState(false);
  // Name capture (after PIX paid)
  const [showNameCapture, setShowNameCapture] = useState(false);
  const [paidPixPaymentId, setPaidPixPaymentId] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [isCreatingTotemOrder, setIsCreatingTotemOrder] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showPrintTickets, setShowPrintTickets] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  // Modals (same as Home)
  const [comboModalOpen, setComboModalOpen] = useState(false);
  const [specialDrinksOpen, setSpecialDrinksOpen] = useState(false);
  const [naturalLunchOpen, setNaturalLunchOpen] = useState(false);
  const [salgadoComboOpen, setSalgadoComboOpen] = useState(false);
  const [hamburgerComboOpen, setHamburgerComboOpen] = useState(false);
  const [customDrinkOpen, setCustomDrinkOpen] = useState(false);
  const [caipirinhaOpen, setCaipirinhaOpen] = useState(false);
  const [copaoOpen, setCopaoOpen] = useState(false);
  const [caipiIceOpen, setCaipiIceOpen] = useState(false);
  const [selectedDrinkType, setSelectedDrinkType] = useState<string | null>(null);
  const protectedTotemFlowRef = useRef(false);

  // Realtime sync - auto-updates products/categories when admin changes prices
  useProductsRealtime();

  useEffect(() => {
    protectedTotemFlowRef.current = showPixScreen || showNameCapture || isCreatingTotemOrder;
  }, [showPixScreen, showNameCapture, isCreatingTotemOrder]);

  // Idle reset listener — dispatched by useKioskMode after 60s inactivity
  useEffect(() => {
    const onIdle = () => {
      if (protectedTotemFlowRef.current) {
        console.log('[Totem] idle reset ignorado durante pagamento/nome/registro');
        return;
      }
      setCart([]);
      setCustomDrinks([]);
      setSelectedCategory(null);
      setSearchQuery('');
      setShowCart(false);
      setShowPayment(false);
      setShowCashChange(false);
      setChangeForValue('');
      setShowSuccess(false);
      setSuccessOrderId('');
      setCustomerName('');
      setShowPixScreen(false);
      setPixTempRef(null);
      setShowKeyboard(false);
      setShowNameCapture(false);
      setPaidPixPaymentId(null);
      setNameSuggestions([]);
      setShowHelp(false);
      setHelpStep(0);
      setComboModalOpen(false);
      setSpecialDrinksOpen(false);
      setNaturalLunchOpen(false);
      setSalgadoComboOpen(false);
      setHamburgerComboOpen(false);
      setCustomDrinkOpen(false);
      setCaipirinhaOpen(false);
      setCopaoOpen(false);
      setCaipiIceOpen(false);
      setSelectedDrinkType(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('totem:idle-reset', onIdle);
    return () => window.removeEventListener('totem:idle-reset', onIdle);
  }, []);

  // Autocomplete: fetch name suggestions while user types on the name-capture screen.
  useEffect(() => {
    if (!showNameCapture) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const sugg = await getNameSuggestions(customerName);
        if (!cancelled) setNameSuggestions(sugg);
      } catch {
        if (!cancelled) setNameSuggestions([]);
      }
    }, 80);
    return () => { cancelled = true; clearTimeout(t); };
  }, [customerName, showNameCapture]);

  const { data: products = [] } = usePublicProducts();
  const { data: rawCategories = [] } = usePublicCategories();

  // Drink types for "Monte seu Drink"
  const { data: drinkTypes = [] } = useQuery({
    queryKey: ['special-drink-configs-totem'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('special_drink_configs')
        .select('slug, label, image_url, gradient, is_enabled, sort_order')
        .eq('is_enabled', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []).map(d => ({
        id: d.slug,
        label: d.label,
        image: d.image_url && d.image_url.startsWith('http') ? d.image_url : (d.image_url || DRINK_DEFAULT_IMAGES[d.slug] || '/assets/drinks/batida.webp'),
        gradient: d.gradient || 'from-purple-500 to-violet-600',
      }));
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleSelectDrinkType = useCallback((typeId: string) => {
    setSelectedDrinkType(typeId);
    if (typeId === 'caipirinha') setCaipirinhaOpen(true);
    else if (typeId === 'copao') setCopaoOpen(true);
    else if (typeId === 'caipi-ice') setCaipiIceOpen(true);
    else setCustomDrinkOpen(true);
  }, []);

  // Custom banner images from DB
  const { data: customBannerImages = {} } = useQuery({
    queryKey: ['feature-banner-images'],
    queryFn: async () => {
      const { data, error } = await supabase.from('banners').select('title, image_url').eq('is_active', true);
      if (error) return {};
      return (data || []).reduce((acc, item) => { acc[item.title] = item.image_url; return acc; }, {} as Record<string, string>);
    },
    staleTime: 1000 * 60 * 5,
  });

  const categories = useMemo(() =>
    rawCategories.filter(c => c.isActive !== false).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
    [rawCategories]
  );

  const activeProducts = useMemo(() =>
    products.filter(p => p.isActive !== false && p.stock > 0),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let filtered = activeProducts;
    if (searchQuery.trim()) {
      const q = normalizeSearch(searchQuery);
      filtered = filtered.filter(p => normalizeSearch(p.name).includes(q));
    } else if (selectedCategory) {
      filtered = filtered.filter(p => p.categoryId === selectedCategory);
    }
    return filtered;
  }, [activeProducts, selectedCategory, searchQuery]);

  const addToCart = useCallback((product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1 }];
    });
    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 500);
  }, []);

  const updateQuantity = useCallback((productId: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if ((i.cartLineId ?? i.product.id) === productId) {
        const newQty = i.quantity + delta;
        return newQty <= 0 ? i : { ...i, quantity: newQty };
      }
      return i;
    }).filter(i => i.quantity > 0));
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart(prev => prev.filter(i => (i.cartLineId ?? i.product.id) !== productId));
  }, []);

  const handleAddComboComponentsToTotem = useCallback(
    (parts: Array<{ product: Product; quantity: number; unitPrice: number }>, comboLabel: string) => {
      const comboId = `combo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCart(prev => [
        ...prev,
        ...parts.map((part, index) => ({
          product: { ...part.product, salePrice: part.unitPrice.toFixed(2) },
          quantity: part.quantity,
          cartLineId: `${comboId}-${index}-${part.product.id}`,
        })),
      ]);
      toast({ title: 'Combo adicionado!', description: comboLabel });
    },
    [toast],
  );

  const handleAddCustomDrink = useCallback((drink: CustomDrink) => {
    setCustomDrinks(prev => [...prev, drink]);
    toast({ title: `🍸 ${drink.name} adicionado!` });
  }, [toast]);

  const removeCustomDrink = useCallback((drinkId: string) => {
    setCustomDrinks(prev => prev.filter(d => d.id !== drinkId));
  }, []);

  const customDrinksTotal = useMemo(() => customDrinks.reduce((sum, d) => sum + d.totalPrice * (d.quantity || 1), 0), [customDrinks]);
  const cartTotal = useMemo(() => cart.reduce((sum, i) => sum + Number(i.product.salePrice) * i.quantity, 0) + customDrinksTotal, [cart, customDrinksTotal]);
  const cartCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0) + customDrinks.reduce((sum, d) => sum + (d.quantity || 1), 0), [cart, customDrinks]);

  const createOrder = useMutation({
    mutationFn: async ({ paymentMethod, changeFor }: { paymentMethod: PaymentMethod; changeFor?: number }) => {
      const items = cart.map(i => ({
        product_id: i.product.id, product_name: i.product.name, quantity: i.quantity,
        unit_price: Number(i.product.salePrice), total_price: Number(i.product.salePrice) * i.quantity,
      }));
      const drinkItems = customDrinks.map(d => ({
        product_id: null, product_name: `🍸 ${d.name}${d.description ? ': ' + d.description : ''}`, quantity: d.quantity || 1,
        unit_price: d.totalPrice, total_price: d.totalPrice * (d.quantity || 1),
      }));
      const allItems = [...items, ...drinkItems];
      if (allItems.length === 0) throw new Error('Carrinho vazio.');

      // RPC ATÔMICA: pedido + itens em transação única (idempotente via client_request_id)
      const clientRequestId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      // Explicit `null` for optional args (required by PostgREST overload resolution — see
      // Checkout.tsx), which the generated RPC arg types don't allow — hence the cast.
      const { data: orderId, error: orderError } = await supabase.rpc('create_totem_order_with_items', {
        p_subtotal: cartTotal,
        p_delivery_fee: 0,
        p_discount: 0,
        p_total: cartTotal,
        p_payment_method: paymentMethod,
        p_items: JSON.stringify(allItems),
        p_change_for: changeFor || null,
        p_notes: null,
        p_customer_name: customerName || 'Totem',
        p_client_request_id: clientRequestId,
      } as any);
      if (orderError) {
        console.error('[Totem] RPC create_totem_order_with_items error', orderError);
        throw orderError;
      }
      if (!orderId) throw new Error('Pedido não foi criado.');
      return orderId as string;
    },
    onSuccess: (orderId) => {
      setSuccessOrderId(orderId.slice(0, 8).toUpperCase());
      setShowPayment(false); setShowCart(false); setShowSuccess(true);
      setCart([]); setCustomDrinks([]); setCustomerName('');
      setTimeout(() => setShowSuccess(false), 8000);
    },
    onError: () => { toast({ title: 'Erro ao criar pedido', variant: 'destructive' }); },
  });

  // PIX polling for totem
  const pixApprovedRef = useRef<(() => void) | null>(null);
  const pixOrderCreatedRef = useRef(false);
  useEffect(() => {
    if (!showPixScreen || !mp.pixData?.payment_id) return;
    pixOrderCreatedRef.current = false;
    mp.startPolling(mp.pixData.payment_id, () => {
      pixApprovedRef.current?.();
    }, 3000);
    return () => mp.stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPixScreen, mp.pixData?.payment_id]);

  const formatPrice = (price: string | number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(price));

  const getFeatureImage = (id: string) => {
    const custom = customBannerImages[id];
    if (custom) return ensureImageUrl(custom);
    return FEATURE_IMAGES[id] || '';
  };

  const featureBanners = [
    { id: 'special-drinks', title: 'Drinks Especiais', desc: 'Drinks exclusivos da casa', icon: Wine, onClick: () => setSpecialDrinksOpen(true) },
    { id: 'combo', title: 'Monte Seu Combo', desc: '5% OFF em combos', icon: Gift, onClick: () => setComboModalOpen(true) },
    { id: 'natural-lunch', title: 'Combo Natural', desc: 'Lanche + Suco 10% OFF', icon: Leaf, onClick: () => setNaturalLunchOpen(true) },
    { id: 'salgado-combo', title: 'Salgado + Refri', desc: '10% OFF no combo', icon: Cookie, onClick: () => setSalgadoComboOpen(true) },
    { id: 'hamburger-combo', title: 'Hambúrguer + Refri', desc: '10% OFF no combo', icon: Sandwich, onClick: () => setHamburgerComboOpen(true) },
  ];

  // ── Success Screen ──
  if (showSuccess) {
    return (
      <div className="h-full w-full flex flex-col bg-gradient-to-br from-[hsl(263,78%,50%)] via-[hsl(270,70%,40%)] to-[hsl(280,60%,30%)] overflow-hidden relative">
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center text-white space-y-8 z-10">
            <div className="text-[100px] leading-none">✅</div>
            <h1 className="text-4xl font-black uppercase">PEDIDO ENVIADO!</h1>
            <div className="bg-white/20 rounded-2xl px-8 py-5 border border-white/30 inline-block">
              <p className="text-lg font-bold uppercase opacity-80">SEU CÓDIGO</p>
              <p className="text-5xl font-black tracking-widest">#{successOrderId}</p>
            </div>
            <div className="space-y-3">
              <p className="text-2xl font-bold uppercase">ELE ENTRARÁ EM PRODUÇÃO</p>
              <p className="text-2xl font-bold uppercase">UM ATENDENTE IRÁ ENTREGAR</p>
              <p className="text-2xl font-bold uppercase">AO FINALIZAR O PREPARO</p>
            </div>
            <p className="text-3xl font-black uppercase mt-4">VIBE DRINKS AGRADECE A PREFERÊNCIA!</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Cash Change Screen ──
  if (showCashChange) {
    const numKeys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    const changeNum = changeForValue ? Number(changeForValue) / 100 : 0;
    const isValid = changeNum >= cartTotal;
    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <TotemHeader title="TROCO PRA QUANTO?" onBack={() => { setShowCashChange(false); setChangeForValue(''); }} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 overflow-y-auto totem-scroll-area max-w-lg mx-auto w-full">
          <div className="bg-gradient-to-br from-primary to-accent rounded-3xl p-5 w-full text-center text-white shadow-xl">
            <p className="text-white/80 text-sm">Total do pedido</p>
            <p className="text-3xl font-black">{formatPrice(cartTotal)}</p>
          </div>
          <div className="bg-card rounded-3xl p-5 w-full text-center shadow-lg border border-primary/30">
            <p className="text-muted-foreground text-sm mb-1">Troco para</p>
            <p className="text-4xl font-black text-primary">{formatPrice(changeNum)}</p>
            {changeNum > 0 && changeNum >= cartTotal && (
              <p className="text-accent text-sm mt-1">Troco: {formatPrice(changeNum - cartTotal)}</p>
            )}
            {changeNum > 0 && changeNum < cartTotal && (
              <p className="text-destructive text-sm mt-1">Valor insuficiente</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 w-full">
            {numKeys.map((k, i) => k === '' ? <div key={i} /> : (
              <button key={k}
                onClick={() => {
                  if (k === '⌫') setChangeForValue(v => v.slice(0, -1));
                  else setChangeForValue(v => v + k);
                }}
                className="h-14 rounded-2xl bg-secondary text-foreground text-2xl font-black shadow border border-border/30"
              >{k}</button>
            ))}
          </div>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => { setChangeForValue(''); setShowCashChange(false); }}
              className="flex-1 h-14 rounded-2xl bg-secondary text-foreground text-lg font-black border border-border/30"
            >Sem troco</button>
            <button
              onClick={() => {
                createOrder.mutate({ paymentMethod: 'cash', changeFor: changeNum > 0 ? changeNum : undefined });
                setShowCashChange(false); setChangeForValue('');
              }}
              disabled={createOrder.isPending}
              className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-[hsl(145,60%,40%)] to-[hsl(155,65%,35%)] text-white text-lg font-black shadow-xl disabled:opacity-40"
            >Confirmar ✅</button>
          </div>
        </div>
      </div>
    );
  }

  // ── PIX Fullscreen (Totem) ──
  if (showPixScreen) {
    const handlePixCancel = async () => {
      if (mp.pixData?.payment_id) {
        await mp.cancelPayment(mp.pixData.payment_id);
      }
      mp.reset();
      setShowPixScreen(false);
      setPixTempRef(null);
      setCart([]); setCustomDrinks([]); setCustomerName('');
      setShowPayment(false); setShowCart(false); setShowCashChange(false); setChangeForValue('');
      setSelectedCategory(null); setSearchQuery(''); setShowKeyboard(false);
    };

    const handlePixApproved = async () => {
      // Guard: prevent duplicate triggers
      if (pixOrderCreatedRef.current) {
        console.log('[Totem] handlePixApproved already executed, skipping duplicate');
        return;
      }
      pixOrderCreatedRef.current = true;

      // Stop polling and switch to name-capture screen.
      // Order is only created AFTER the customer confirms their name.
      mp.stopPolling();
      setPaidPixPaymentId(mp.pixData?.payment_id || null);
      setShowPixScreen(false);
      setShowNameCapture(true);
      setCustomerName('');
      setNameSuggestions([]);
    };

    pixApprovedRef.current = handlePixApproved;

    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <TotemHeader title="PAGAMENTO PIX" />
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 min-h-0 overflow-y-auto totem-scroll-area">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">Valor a pagar</p>
            <p className="text-4xl font-black text-primary">{formatPrice(cartTotal)}</p>
          </div>
          {mp.loading && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}
          {mp.error && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-destructive font-bold">{mp.error}</p>
              <button onClick={() => { mp.reset(); if (pixTempRef) mp.createPixPayment(cartTotal, 'Totem - Pedido Vibe Drinks', pixTempRef); }}
                className="px-6 py-2 rounded-2xl bg-primary text-primary-foreground font-bold">
                Tentar novamente
              </button>
            </div>
          )}
          {mp.pixData && !mp.error && (
            <>
              <div className="p-4 bg-white rounded-2xl shadow-xl border-2 border-primary/20">
                {mp.pixData.qr_code_base64 ? (
                  <img src={`data:image/png;base64,${mp.pixData.qr_code_base64}`} alt="QR Code PIX" className="w-48 h-48" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center">
                    <QrCode className="w-24 h-24 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 bg-accent/10 px-4 py-2.5 rounded-xl border border-accent/20">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
                <span className="font-bold text-accent">Aguardando pagamento...</span>
              </div>
              <p className="text-muted-foreground text-center text-xs max-w-xs">
                Abra o app do seu banco, escaneie o QR Code e confirme.
              </p>
            </>
          )}
        </div>
        <div className="p-4 flex-shrink-0">
          <button onClick={handlePixCancel}
            className="w-full py-4 rounded-2xl bg-destructive text-destructive-foreground text-lg font-black shadow-xl">
            ❌ Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ── Name Capture Screen (after PIX paid) ──
  if (showNameCapture) {
    const nameValid = customerName.trim().length >= 2;

    const appendChar = (c: string) => setCustomerName((v) => (v + c).slice(0, 40));
    const backspace = () => setCustomerName((v) => v.slice(0, -1));
    const pickSuggestion = (s: string) => setCustomerName(s);

    const handleConfirmName = async () => {
      if (isCreatingTotemOrder) {
        console.log('[Totem] handleConfirmName already running, ignoring duplicate click');
        return;
      }
      setIsCreatingTotemOrder(true);
      try {
        const finalName = (customerName.trim() || 'CLIENTE').toUpperCase();
        console.log('[Totem] handleConfirmName start', { finalName, cartLen: cart.length, drinksLen: customDrinks.length, paidPixPaymentId });

        // Build items
        const items = cart.map((i) => ({
          product_id: i.product.id,
          product_name: i.product.name,
          quantity: i.quantity,
          unit_price: Number(i.product.salePrice),
          total_price: Number(i.product.salePrice) * i.quantity,
        }));
        const drinkItems = customDrinks.map((d) => ({
          product_id: null,
          product_name: `🍸 ${d.name}${d.description ? ': ' + d.description : ''}`,
          quantity: d.quantity || 1,
          unit_price: d.totalPrice,
          total_price: d.totalPrice * (d.quantity || 1),
        }));
        const allItems = [...items, ...drinkItems];
        if (allItems.length === 0) throw new Error('Carrinho vazio.');

        const pixClientRequestId =
          pixTempRef ||
          (typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`);

        if (!paidPixPaymentId) throw new Error('Pagamento PIX aprovado sem código de confirmação. Chame o atendente.');

        const { data: finalizeData, error: finalizeError } = await supabase.functions.invoke('mp-payments', {
          body: {
            action: 'finalize_totem_order',
            payment_id: paidPixPaymentId,
            customer_name: finalName,
            client_request_id: pixClientRequestId,
            total: cartTotal,
            items: allItems,
          },
        });

        if (finalizeError || finalizeData?.error || !finalizeData?.order_id) {
          console.error('[Totem] finalize_totem_order failed', { finalizeError, finalizeData });
          throw new Error(
            finalizeData?.detail || finalizeData?.error || finalizeError?.message ||
            `Pagamento PIX aprovado, mas falhou ao registrar o pedido. Mostre o comprovante ao atendente (MP #${paidPixPaymentId}).`
          );
        }

        const orderId = finalizeData.order_id as string;

        console.log('[Totem] order created via RPC', orderId);

        const orderCode = (orderId as string).slice(0, 8).toUpperCase();

        // Remember the name for future autocomplete (best-effort)
        rememberCustomerName(finalName).catch(() => {});

        // Imprime ticket térmico (silencioso com Chrome --kiosk-printing).
        // AWAIT para garantir que window.print() seja disparado antes de resetar
        // o estado da tela (evita iframe ser removido cedo demais).
        // Nunca bloqueia o sucesso: erros são logados mas não interrompem.
        const ticketItems = allItems.map((it) => ({
          name: it.product_name,
          qty: it.quantity,
        }));
        try {
          await printTotemTicket({
            customerName: finalName,
            orderCode,
            items: ticketItems,
          });
          console.log('[Totem] ticket impresso com sucesso');
        } catch (printErr) {
          console.error('[Totem] erro na impressão (pedido já salvo):', printErr);
        }

        // Reset & show success
        mp.reset();
        setShowNameCapture(false);
        setPaidPixPaymentId(null);
        setPixTempRef(null);
        setNameSuggestions([]);
        setSuccessOrderId(orderCode);
        setShowPayment(false);
        setShowCart(false);
        setShowSuccess(true);
        setCart([]);
        setCustomDrinks([]);
        setCustomerName('');
        setTimeout(() => setShowSuccess(false), 8000);
      } catch (err: any) {
        console.error('[Totem] confirm name error', err);
        toast({
          title: 'Erro ao registrar pedido',
          description: err?.message || 'Tente novamente. Se persistir, procure um atendente.',
          variant: 'destructive',
        });
        // Allow retry
        pixOrderCreatedRef.current = false;
      } finally {
        setIsCreatingTotemOrder(false);
      }
    };

    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <TotemHeader title="QUAL SEU NOME?" />
        <div className="flex-1 flex flex-col items-center px-4 pt-4 pb-2 gap-3 overflow-hidden max-w-2xl mx-auto w-full">
          <div className="bg-gradient-to-br from-[hsl(145,60%,40%)] to-[hsl(155,65%,35%)] rounded-2xl px-5 py-3 w-full text-center text-white shadow-lg">
            <p className="text-white/90 text-sm font-bold">✅ PAGAMENTO APROVADO</p>
            <p className="text-2xl font-black">{formatPrice(cartTotal)}</p>
          </div>

          {/* Name display */}
          <div className="w-full bg-card rounded-2xl border-2 border-primary/30 px-5 py-4 min-h-[68px] flex items-center justify-center shadow-md">
            <p className={`text-3xl font-black uppercase tracking-wide ${customerName ? 'text-primary' : 'text-muted-foreground/50'}`}>
              {customerName || 'DIGITE SEU NOME'}
              <span className="inline-block w-1 h-7 bg-primary ml-1 animate-pulse align-middle" />
            </p>
          </div>

          {/* Suggestions */}
          <div className="w-full min-h-[44px]">
            {nameSuggestions.length > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                {nameSuggestions.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    onClick={() => pickSuggestion(s)}
                    className="px-4 h-10 rounded-xl bg-primary/10 text-primary font-extrabold text-sm uppercase border border-primary/30 active:scale-95"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                As sugestões aparecem aqui enquanto você digita
              </p>
            )}
          </div>

          {/* QWERTY keyboard */}
          <div className="w-full space-y-1.5">
            {KEYBOARD_ROWS.map((row, ri) => (
              <div key={ri} className="flex justify-center gap-1">
                {row.map((key) => (
                  <button
                    key={key}
                    onClick={() => appendChar(key)}
                    className="flex-1 max-w-[60px] h-14 rounded-xl bg-[hsl(263,15%,93%)] text-[hsl(263,30%,20%)] font-bold text-xl flex items-center justify-center active:bg-primary active:text-white transition-colors"
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
            <div className="flex justify-center gap-1">
              <button
                onClick={() => appendChar(' ')}
                className="flex-1 max-w-[280px] h-14 rounded-xl bg-[hsl(263,15%,90%)] text-[hsl(263,30%,30%)] font-bold flex items-center justify-center"
              >
                Espaço
              </button>
              <button
                onClick={backspace}
                className="w-24 h-14 rounded-xl bg-[hsl(263,15%,90%)] text-[hsl(263,30%,30%)] font-bold text-xl flex items-center justify-center"
              >
                ⌫
              </button>
              <button
                onClick={() => setCustomerName('')}
                className="w-24 h-14 rounded-xl bg-destructive/15 text-destructive font-bold text-xs flex items-center justify-center"
              >
                LIMPAR
              </button>
            </div>
          </div>

          {/* Confirm */}
          <button
            onClick={handleConfirmName}
            disabled={!nameValid || isCreatingTotemOrder}
            className="w-full h-16 rounded-2xl bg-gradient-to-r from-[hsl(145,60%,40%)] to-[hsl(155,65%,35%)] text-white text-xl font-black shadow-xl disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            {isCreatingTotemOrder ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                REGISTRANDO...
              </>
            ) : (
              <>🖨️ IMPRIMIR PEDIDO</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Payment Screen ──
  if (showPayment) {
    const payOpts = [
      { method: 'pix' as PaymentMethod, label: 'PIX', emoji: '📱', gradient: 'from-[hsl(160,60%,40%)] to-[hsl(170,70%,35%)]', disabled: false },
      { method: 'cash' as PaymentMethod, label: 'Dinheiro', emoji: '💵', gradient: 'from-[hsl(40,80%,50%)] to-[hsl(35,85%,45%)]', disabled: true, maintenanceLabel: '🔧 Em manutenção' },
      { method: 'card_debit' as PaymentMethod, label: 'Débito', emoji: '💳', gradient: 'from-[hsl(210,70%,50%)] to-[hsl(220,75%,45%)]', disabled: true, maintenanceLabel: '🔧 Em manutenção' },
      { method: 'card_credit' as PaymentMethod, label: 'Crédito', emoji: '🏦', gradient: 'from-[hsl(280,60%,50%)] to-[hsl(290,65%,40%)]', disabled: true, maintenanceLabel: '🔧 Em manutenção' },
    ];
    const handlePaymentSelect = async (method: PaymentMethod) => {
      if (method === 'pix') {
        const tempRef = crypto.randomUUID();
        setPixTempRef(tempRef);
        mp.reset();
        setShowPixScreen(true);
        mp.createPixPayment(cartTotal, 'Totem - Pedido Vibe Drinks', tempRef);
      }
      // cash/card disabled — no-op
    };
    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <TotemHeader title="PAGAMENTO" onBack={() => setShowPayment(false)} />
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 overflow-y-auto totem-scroll-area max-w-lg mx-auto w-full">
          <div className="bg-gradient-to-br from-primary to-accent rounded-3xl p-5 w-full text-center text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <p className="text-white/80 text-sm">Total do pedido</p>
            <p className="text-4xl font-black">{formatPrice(cartTotal)}</p>
            <p className="text-white/60 text-xs mt-1">Você receberá um código para retirada</p>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full">
            {payOpts.map((pm) => (
              <button key={pm.method} onClick={() => !pm.disabled && handlePaymentSelect(pm.method)} disabled={createOrder.isPending || pm.disabled}
                className={`bg-gradient-to-br ${pm.gradient} text-white rounded-3xl p-5 flex flex-col items-center gap-2 shadow-lg disabled:opacity-40 min-h-[110px] justify-center relative ${pm.disabled ? 'grayscale' : ''}`}
              >
                <span className="text-4xl">{pm.emoji}</span>
                <span className="text-lg font-black">{pm.label}</span>
                {(pm as any).maintenanceLabel && (
                  <span className="text-xs font-bold bg-black/30 rounded-full px-3 py-1">{(pm as any).maintenanceLabel}</span>
                )}
              </button>
            ))}
          </div>
          {createOrder.isPending && <p className="text-primary font-bold animate-pulse">⏳ Processando...</p>}
        </div>
      </div>
    );
  }

  // ── Cart View ──
  if (showCart) {
    return (
      <div className="h-full w-full bg-white flex flex-col overflow-hidden">
        <TotemHeader 
          title="SEU PEDIDO" 
          onBack={() => setShowCart(false)} 
          rightContent={<span className="bg-primary/10 text-primary rounded-xl px-3 py-1 text-sm font-bold">{cartCount} itens</span>}
        />
        <div className="flex-1 overflow-y-auto totem-scroll-area p-4 space-y-3">
          {cart.length === 0 && customDrinks.length === 0 ? (
            <div className="flex items-center justify-center h-[60vh]">
              <div className="text-center text-muted-foreground space-y-3">
                <div className="text-7xl">🛒</div>
                <p className="text-xl font-bold">Carrinho vazio</p>
                <p>Toque em "Adicionar" nos produtos</p>
              </div>
            </div>
          ) : (
            <>
              {customDrinks.map(drink => (
                <div key={drink.id} className="bg-card rounded-2xl p-3 shadow-md border border-primary/30">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-3xl">🍸</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-sm truncate">{drink.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{drink.description}</p>
                      <p className="text-primary font-black text-lg">{formatPrice(drink.totalPrice * (drink.quantity || 1))}</p>
                    </div>
                    <button onClick={() => removeCustomDrink(drink.id)}
                      className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {cart.map(item => {
                const lineId = item.cartLineId ?? item.product.id;
                return (
                <div key={lineId} className="bg-card rounded-2xl p-3 shadow-md flex items-center gap-3 border border-border/30">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-secondary flex-shrink-0">
                    {item.product.imageUrl ? (
                      <img src={ensureImageUrl(item.product.imageUrl)} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl bg-primary/5">🍺</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm truncate">{item.product.name}</p>
                    <p className="text-primary font-black text-lg">{formatPrice(Number(item.product.salePrice) * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => item.quantity === 1 ? removeFromCart(lineId) : updateQuantity(lineId, -1)}
                      className="w-10 h-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
                      {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </button>
                    <span className="text-xl font-black w-8 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(lineId, 1)}
                      className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                );
              })}
            </>
          )}
        </div>
        {(cart.length > 0 || customDrinks.length > 0) && (
          <div className="border-t-2 border-primary/10 p-4 bg-white flex-shrink-0">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground">{cartCount} itens</p>
                <p className="text-2xl font-black text-primary">{formatPrice(cartTotal)}</p>
              </div>
              <button onClick={() => setShowPayment(true)}
                className="bg-gradient-to-r from-[hsl(145,60%,40%)] to-[hsl(155,65%,35%)] text-white rounded-2xl px-7 py-4 text-lg font-black shadow-xl flex items-center gap-2">
                Finalizar ✅
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isSearchActive = showKeyboard || searchQuery.trim().length > 0;


  const helpSteps = [
    { emoji: '👋', title: 'Bem-vindo ao Totem!', desc: 'Navegue pelos produtos e monte seu pedido sozinho.' },
    { emoji: '👆', title: 'Deslize para navegar', desc: 'Arraste para os lados nos banners e categorias. Arraste para cima/baixo nos produtos.' },
    { emoji: '➕', title: 'Adicionar ao pedido', desc: 'Toque no botão "Adicionar" dentro do card do produto.' },
    { emoji: '🍹', title: 'Monte seu Drink', desc: 'Toque nos ícones coloridos para personalizar drinks.' },
    { emoji: '🛒', title: 'Finalizar', desc: 'Toque no carrinho no topo para revisar e pagar.' },
  ];

  return (
    <div className="h-full w-full bg-white flex flex-col overflow-hidden">
      {/* ═══ Help Tutorial Overlay ═══ */}
      <AnimatePresence>
        {showHelp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-6"
            onClick={() => { setShowHelp(false); setHelpStep(0); }}>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-5"
              onClick={e => e.stopPropagation()}>
              <div className="text-center space-y-3">
                <div className="text-7xl">{helpSteps[helpStep].emoji}</div>
                <h2 className="text-2xl font-black text-primary">{helpSteps[helpStep].title}</h2>
                <p className="text-lg text-muted-foreground">{helpSteps[helpStep].desc}</p>
              </div>
              <div className="flex justify-center gap-2">
                {helpSteps.map((_, i) => (
                  <div key={i} className={`h-2 rounded-full transition-all ${i === helpStep ? 'w-8 bg-primary' : 'w-2 bg-muted'}`} />
                ))}
              </div>
              <div className="flex gap-3">
                {helpStep > 0 && (
                  <button onClick={() => setHelpStep(s => s - 1)}
                    className="flex-1 py-4 rounded-2xl border-2 border-primary/20 text-primary font-bold text-lg">
                    Voltar
                  </button>
                )}
                <button
                  onClick={() => {
                    if (helpStep < helpSteps.length - 1) setHelpStep(s => s + 1);
                    else { setShowHelp(false); setHelpStep(0); }
                  }}
                  className="flex-1 py-4 rounded-2xl bg-primary text-white font-black text-lg shadow-lg">
                  {helpStep < helpSteps.length - 1 ? 'Próximo →' : 'Entendi! ✅'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Top Bar - White with shadow, triple height ═══ */}
      <div className="flex-shrink-0 bg-white shadow-md px-4 flex items-center justify-between" style={{ height: '90px' }}>
        {/* Botão Início */}
        <button
          onClick={() => { setCart([]); setCustomDrinks([]); setSelectedCategory(null); setSearchQuery(''); setShowKeyboard(false); setShowCart(false); setShowPayment(false); setShowCashChange(false); setChangeForValue(''); setShowPixScreen(false); mp.reset(); setPixTempRef(null); setShowNameCapture(false); setPaidPixPaymentId(null); setNameSuggestions([]); setCustomerName(''); }}
          className="flex items-center gap-2 bg-primary/10 rounded-2xl px-4 py-2.5 text-primary">
          <Store className="w-5 h-5" />
          <span className="text-sm font-extrabold uppercase tracking-tight">Início</span>
        </button>

        {/* Logo central - bigger */}
        <img src={totemLogo} alt="VM" className="h-16 w-auto" />

        {/* Help + Cart buttons */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)}
            className="w-[52px] h-[52px] rounded-xl bg-accent/15 text-accent flex items-center justify-center border-2 border-accent/30">
            <HelpCircle className="w-7 h-7" />
          </button>
          <button
            onClick={() => setShowPrintTickets(true)}
            aria-label="Reimprimir tickets"
            title="Reimprimir tickets"
            className="w-[52px] h-[52px] rounded-xl bg-muted/20 text-muted-foreground/40 flex items-center justify-center border border-muted/20 hover:text-muted-foreground/70 transition-colors"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* ═══ Keyboard inline ═══ */}
      {showKeyboard && (
        <div className="flex-shrink-0 bg-white shadow-lg border-b border-[hsl(263,15%,85%)] px-3 pt-3 pb-3 space-y-1.5">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map(key => (
                <button key={key}
                  onClick={() => setSearchQuery(prev => prev + key)}
                  className="flex-1 max-w-[60px] h-12 rounded-xl bg-[hsl(263,15%,93%)] text-[hsl(263,30%,20%)] font-bold text-lg flex items-center justify-center active:bg-primary active:text-white transition-colors"
                >{key}</button>
              ))}
            </div>
          ))}
          <div className="flex justify-center gap-1">
            <button onClick={() => setSearchQuery(prev => prev + ' ')}
              className="flex-1 max-w-[240px] h-12 rounded-xl bg-[hsl(263,15%,90%)] text-[hsl(263,30%,30%)] font-bold text-sm flex items-center justify-center">
              Espaço
            </button>
            <button onClick={() => setSearchQuery(prev => prev.slice(0, -1))}
              className="w-20 h-12 rounded-xl bg-[hsl(263,15%,90%)] text-[hsl(263,30%,30%)] font-bold text-sm flex items-center justify-center">
              ⌫
            </button>
            <button onClick={() => { setShowKeyboard(false); if (!searchQuery.trim()) setSearchQuery(''); }}
              className="w-20 h-12 rounded-xl bg-primary text-white font-bold text-sm flex items-center justify-center">
              OK
            </button>
          </div>
        </div>
      )}

      {/* ═══ FIXED ABOVE SCROLL: banners, drinks, search, categories ═══ */}
      <div className="flex-shrink-0 bg-[hsl(0,0%,96%)]">
        {/* Feature Banners - bigger cards */}
        {!isSearchActive && (
          <div className="pt-2 pb-1.5 relative">
            <div className="flex gap-3 overflow-x-auto totem-horizontal-scroll pb-1 px-2">
              {featureBanners.map(fb => {
                const imageUrl = getFeatureImage(fb.id);
                return (
                  <button key={fb.id} onClick={fb.onClick}
                    className="flex-shrink-0 w-[300px] h-[180px] rounded-2xl overflow-hidden relative snap-start shadow-lg active:scale-[0.97] transition-transform">
                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${imageUrl})` }} />
                  </button>
                );
              })}
            </div>
            {/* Static swipe indicator */}
            {featureBanners.length > 1 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 rounded-full p-2 pointer-events-none">
                <ChevronRight className="w-6 h-6 text-white" />
              </div>
            )}
          </div>
        )}

        {/* Monte seu Drink - Grid 4x2 */}
        {!isSearchActive && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 mb-2 px-1 justify-center">
              <Flame className="h-5 w-5 text-orange-500" />
              <span className="text-sm font-black text-foreground uppercase tracking-wider">Monte seu Drink</span>
            </div>
            <div className="grid grid-cols-4 gap-2 px-0">
              {/* Active drink types */}
              {drinkTypes.map(type => (
                <button key={type.id} onClick={() => handleSelectDrinkType(type.id)}
                  className="relative active:scale-95 transition-transform">
                  <div className="w-full aspect-square rounded-xl overflow-hidden shadow-lg border-2 border-primary/30 relative">
                    <img src={type.image} alt={type.label} className="w-full h-full object-cover" loading="lazy"
                      onError={e => { (e.target as HTMLImageElement).src = DRINK_DEFAULT_IMAGES[type.id] || '/assets/drinks/batida.webp'; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="absolute bottom-1.5 left-0 right-0 text-[11px] font-black text-white text-center px-0.5 leading-tight" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{type.label}</span>
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center shadow-md">
                    <Flame className="h-2.5 w-2.5 text-white" />
                  </div>
                </button>
              ))}
              {/* "Em Breve" placeholders to fill remaining slots (último slot reservado para o carrinho) */}
              {Array.from({ length: Math.max(0, 7 - drinkTypes.length) }).map((_, i) => (
                <div key={`coming-${i}`} className="relative">
                  <div className="w-full aspect-square rounded-xl overflow-hidden shadow-lg border-2 border-muted/30 relative bg-muted/20">
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl mb-1">🔒</span>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Em Breve</span>
                    </div>
                  </div>
                </div>
              ))}
              {/* Botão Carrinho — mesmo tamanho dos cards de drink */}
              <button
                onClick={() => cartCount > 0 && setShowCart(true)}
                disabled={cartCount === 0}
                aria-label="Abrir carrinho"
                className="relative active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100"
              >
                <div className={`w-full aspect-square rounded-xl overflow-hidden shadow-lg border-2 relative flex flex-col items-center justify-center ${
                  cartCount > 0
                    ? 'bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 border-amber-300'
                    : 'bg-muted/30 border-muted/40'
                }`}>
                  <ShoppingCart className={`w-9 h-9 ${cartCount > 0 ? 'text-primary' : 'text-muted-foreground/50'}`} />
                  <span className={`mt-1 text-[10px] font-black uppercase tracking-wider ${cartCount > 0 ? 'text-primary' : 'text-muted-foreground/60'}`}>
                    Carrinho
                  </span>
                </div>
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full bg-destructive text-white text-xs font-black flex items-center justify-center shadow-md border-2 border-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="px-3 py-1.5">
          <button onClick={() => setShowKeyboard(true)}
            className={`w-full h-9 rounded-xl border shadow-sm flex items-center gap-2.5 px-3.5 text-left ${
              showKeyboard || searchQuery
                ? 'bg-secondary border-primary/40'
                : 'bg-card border-border'
            }`}>
            <Search className="w-4 h-4 text-primary flex-shrink-0" />
            {searchQuery ? (
              <span className="text-sm font-medium text-foreground flex-1 truncate">{searchQuery}</span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground flex-1">Buscar produtos...</span>
            )}
            {searchQuery && (
              <div onClick={(e) => { e.stopPropagation(); setSearchQuery(''); }}
                className="p-1 rounded-full bg-secondary">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </button>
        </div>

        {/* Categories - Square icons like CompactCategoryCarousel */}
        {!isSearchActive && (
          <div className="px-3 pb-1.5">
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto totem-horizontal-scroll py-1">
                {categories.map(cat => {
                  const isSelected = selectedCategory === cat.id;
                  const IconComponent = getCategoryIcon(cat.iconUrl);
                  return (
                    <button key={cat.id} onClick={() => setSelectedCategory(isSelected ? null : (cat.id || null))}
                      className={`relative flex flex-col items-center justify-center gap-1 min-w-[72px] w-[72px] h-[72px] rounded-2xl transition-colors duration-200 flex-shrink-0 overflow-hidden ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-md border border-primary/50'
                          : 'bg-white border border-primary/20 text-foreground shadow-sm'
                      }`}>
                      <IconComponent className={`h-6 w-6 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                      <span className={`text-[10px] font-bold leading-[1.15] tracking-tight text-center w-full px-1 line-clamp-2 break-words uppercase ${
                        isSelected ? 'text-primary-foreground' : 'text-foreground'
                      }`}>{cat.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[hsl(0,0%,96%)] to-transparent pointer-events-none rounded-r-lg" />
            </div>
          </div>
        )}

        {/* Search results count */}
        {isSearchActive && filteredProducts.length > 0 && (
          <div className="px-4 py-1">
            <p className="text-xs font-semibold text-muted-foreground">
              {filteredProducts.length} resultado{filteredProducts.length !== 1 ? 's' : ''} para "{searchQuery}"
            </p>
          </div>
        )}
      </div>

      {/* ═══ SCROLLABLE: Product Grid only ═══ */}
      <div className="flex-1 min-h-0 overflow-y-auto totem-vertical-scroll totem-scroll-area bg-[hsl(0,0%,96%)]">
        <div className="px-2 pb-8 pt-1">
          <div className="grid grid-cols-4 gap-1.5">
            {filteredProducts.map(product => {
              const inCart = cart.find(i => i.product.id === product.id);
              const justAdded = addedProductId === product.id;
              return (
                <div key={product.id}
                  style={{ contain: 'layout style' }}
                  className={`relative rounded-xl overflow-hidden shadow-sm border bg-white ${
                    inCart ? 'border-primary' : 'border-transparent'
                  }`}>
                  {/* Image */}
                  <div className="aspect-[4/3] relative bg-[hsl(263,15%,93%)] overflow-hidden">
                    {product.imageUrl ? (
                      <img src={ensureImageUrl(product.imageUrl)} alt={product.name} className="w-full h-full object-cover" loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                        <span className="text-lg">🍺</span>
                      </div>
                    )}
                    {justAdded && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
                        <div className="bg-white rounded-full p-1.5"><Plus className="w-4 h-4 text-primary" /></div>
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-1.5 flex flex-col items-center text-center gap-0.5">
                    <p className="font-extrabold text-[11px] line-clamp-2 leading-[1.15] tracking-tight text-foreground min-h-[1.65rem]">{product.name}</p>
                    <p className="text-primary font-extrabold text-sm leading-none">{formatPrice(product.salePrice)}</p>
                    <div className="mt-0.5 w-full flex justify-center">
                      {inCart ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => inCart.quantity === 1 ? removeFromCart(product.id) : updateQuantity(product.id, -1)}
                            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center active:scale-90 transition-transform">
                            {inCart.quantity === 1 ? <Trash2 className="w-3 h-3 text-destructive" /> : <Minus className="w-3 h-3 text-foreground" />}
                          </button>
                          <span className="text-sm font-extrabold text-primary w-5 text-center">{inCart.quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, 1)}
                            className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-90 transition-transform">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          className="w-full h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center gap-1 font-extrabold text-[10px] tracking-tight active:scale-95 transition-transform">
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {filteredProducts.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-2">
                <div className="text-5xl">🔍</div>
                <p className="text-sm font-bold text-[hsl(263,20%,40%)]">Nenhum produto encontrado</p>
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(''); setShowKeyboard(false); }}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-primary/10 text-primary font-bold text-xs">
                    Limpar busca
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Modals (same as Home) ═══ */}
      <SpecialDrinksModal open={specialDrinksOpen} onOpenChange={setSpecialDrinksOpen} onAddItem={addToCart} />
      <ComboModal open={comboModalOpen} onOpenChange={setComboModalOpen} onAddComboComponents={handleAddComboComponentsToTotem} />
      <NaturalLunchModal open={naturalLunchOpen} onOpenChange={setNaturalLunchOpen} onAddItem={addToCart} />
      <SalgadoComboModal open={salgadoComboOpen} onOpenChange={setSalgadoComboOpen} onAddItem={addToCart} />
      <HamburgerComboModal open={hamburgerComboOpen} onOpenChange={setHamburgerComboOpen} onAddItem={addToCart} />
      <CustomDrinkModal open={customDrinkOpen} onOpenChange={setCustomDrinkOpen} drinkType={selectedDrinkType} onAddCustomDrink={handleAddCustomDrink} />
      <CaipirinhaModal open={caipirinhaOpen} onOpenChange={setCaipirinhaOpen} onAddCustomDrink={handleAddCustomDrink} />
      <CopaoModal open={copaoOpen} onOpenChange={setCopaoOpen} onAddCustomDrink={handleAddCustomDrink} />
      <CaipiIceModal open={caipiIceOpen} onOpenChange={setCaipiIceOpen} onAddCustomDrink={handleAddCustomDrink} />

      {/* Kiosk mode styles */}
      <style>{`
        .totem-horizontal-scroll::-webkit-scrollbar,
        .totem-vertical-scroll::-webkit-scrollbar,
        .totem-scroll-area::-webkit-scrollbar { display: none; }
        .totem-horizontal-scroll,
        .totem-vertical-scroll,
        .totem-scroll-area { -ms-overflow-style: none; scrollbar-width: none; }




        /* Kiosk mode global overrides */
        body.kiosk-mode {
          overflow: hidden;
          overflow-x: hidden;
          overscroll-behavior: none;
          -webkit-tap-highlight-color: transparent;
          cursor: none !important;
          background: hsl(0, 0%, 96%);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          font-synthesis: none;
          font-kerning: normal;
          text-size-adjust: 100%;
          -webkit-text-size-adjust: 100%;
          text-rendering: optimizeLegibility;
        }
        body.kiosk-mode * {
          user-select: none;
          -webkit-user-select: none;
          cursor: none !important;
          -webkit-tap-highlight-color: transparent;
          font-synthesis: none;
        }
        body.kiosk-mode input,
        body.kiosk-mode textarea {
          user-select: text;
          -webkit-user-select: text;
          touch-action: auto;
          cursor: text !important;
        }
        body.kiosk-mode img {
          pointer-events: none;
          -webkit-user-drag: none;
        }

        /* Layout: full-screen kiosk - fills entire monitor */
        body.kiosk-mode #root {
          width: 100%;
          max-width: 100%;
          height: 100vh;
          height: 100dvh;
          margin: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: hsl(0, 0%, 96%);
        }

        /* CRITICAL: Allow touch scrolling everywhere by default */
        body.kiosk-mode,
        body.kiosk-mode * {
          touch-action: pan-y pan-x;
        }

        /* Scrollable content areas - vertical */
        body.kiosk-mode .totem-scroll-area,
        body.kiosk-mode .totem-vertical-scroll {
          overflow-y: auto !important;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y !important;
          overscroll-behavior-y: contain;
        }
        body.kiosk-mode .totem-scroll-area *,
        body.kiosk-mode .totem-vertical-scroll * {
          touch-action: pan-y !important;
        }

        /* Horizontal scroll areas */
        body.kiosk-mode .totem-horizontal-scroll {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x !important;
          overscroll-behavior-x: contain;
        }
        body.kiosk-mode .totem-horizontal-scroll * {
          touch-action: pan-x !important;
        }

        /* Overscroll bounce prevention */
        html, body {
          overscroll-behavior: none;
        }

        /* Drag-to-scroll grab cursor for old touch monitors */
        body.kiosk-mode .totem-scroll-area,
        body.kiosk-mode .totem-vertical-scroll,
        body.kiosk-mode .totem-horizontal-scroll {
          cursor: grab;
        }
        body.kiosk-mode .totem-scroll-area:active,
        body.kiosk-mode .totem-vertical-scroll:active,
        body.kiosk-mode .totem-horizontal-scroll:active {
          cursor: grabbing;
        }
      `}</style>
      <TotemPrintTicketsModal open={showPrintTickets} onClose={() => setShowPrintTickets(false)} />
    </div>
  );
}

// ── Kiosk mode hooks ──
function useKioskMode() {
  useEffect(() => {
    const body = document.body;
    body.classList.add('kiosk-mode');

    const isTouch = 'ontouchstart' in window;
    body.classList.toggle('touch', isTouch);

    let viewportMeta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    const originalViewport = viewportMeta?.getAttribute('content') || '';
    if (viewportMeta) {
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    const passiveTouch = () => {};
    document.addEventListener('touchstart', passiveTouch, { passive: true });

    const blockContext = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', blockContext);

    const blockZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    window.addEventListener('wheel', blockZoom, { passive: false });

    const blockKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', blockKeyZoom);

    const blockExternal = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (target && (target as HTMLAnchorElement).target === '_blank') {
        e.preventDefault();
      }
    };
    document.addEventListener('click', blockExternal);

    const enterFs = () => {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) {
        el.requestFullscreen().catch(() => {});
      }
    };
    document.addEventListener('click', enterFs, { once: true });
    document.addEventListener('touchstart', enterFs, { once: true });

    // ── Drag-to-scroll for old touch monitors (mouse events) ──
    const MOVE_THRESHOLD = 10; // px before treating as drag
    let dragMoved = false; // true once threshold exceeded
    let clickTimeout: ReturnType<typeof setTimeout> | null = null;

    let dragState: {
      el: HTMLElement;
      isDown: boolean;
      startY: number;
      scrollTop: number;
      startX: number;
      scrollLeft: number;
      lastY: number;
      lastTime: number;
      velocityY: number;
      animFrame: number;
      isHorizontal: boolean;
      target: HTMLElement;
    } | null = null;

    const findScrollable = (target: HTMLElement): { el: HTMLElement; horizontal: boolean } | null => {
      let node: HTMLElement | null = target;
      while (node && node !== document.body) {
        if (node.classList.contains('totem-horizontal-scroll')) {
          return { el: node, horizontal: true };
        }
        if (node.classList.contains('totem-vertical-scroll') || node.classList.contains('totem-scroll-area')) {
          return { el: node, horizontal: false };
        }
        if (node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== 'hidden') {
          return { el: node, horizontal: false };
        }
        node = node.parentElement;
      }
      return null;
    };

    // Block accidental clicks that happen after a drag
    const onClickCapture = (e: MouseEvent) => {
      if (dragMoved) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Reset after blocking
        setTimeout(() => { dragMoved = false; }, 50);
      }
    };
    document.addEventListener('click', onClickCapture, true); // capture phase!

    const onMouseDown = (e: MouseEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const scrollable = findScrollable(e.target as HTMLElement);
      if (!scrollable) return;

      if (dragState?.animFrame) cancelAnimationFrame(dragState.animFrame);
      if (clickTimeout) { clearTimeout(clickTimeout); clickTimeout = null; }
      dragMoved = false;

      dragState = {
        el: scrollable.el,
        isDown: true,
        startY: e.pageY,
        scrollTop: scrollable.el.scrollTop,
        startX: e.pageX,
        scrollLeft: scrollable.el.scrollLeft,
        lastY: e.pageY,
        lastTime: Date.now(),
        velocityY: 0,
        animFrame: 0,
        isHorizontal: scrollable.horizontal,
        target: e.target as HTMLElement,
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState?.isDown) return;

      const dx = e.pageX - dragState.startX;
      const dy = e.pageY - dragState.startY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Only start scrolling after exceeding threshold
      if (distance < MOVE_THRESHOLD && !dragMoved) return;

      if (!dragMoved) {
        dragMoved = true;
        dragState.el.style.cursor = 'grabbing';
      }

      e.preventDefault();
      const now = Date.now();
      const dt = now - dragState.lastTime;

      if (dragState.isHorizontal) {
        dragState.el.scrollLeft = dragState.scrollLeft - dx;
      } else {
        dragState.el.scrollTop = dragState.scrollTop - dy;
        if (dt > 0) {
          dragState.velocityY = (e.pageY - dragState.lastY) / dt;
        }
      }
      dragState.lastY = e.pageY;
      dragState.lastTime = now;
    };

    const onMouseUp = () => {
      if (!dragState?.isDown) return;
      dragState.isDown = false;
      dragState.el.style.cursor = '';

      // If we didn't move beyond threshold → it was a tap/click, let it through naturally
      // dragMoved stays false so onClickCapture won't block the click

      // If we did drag → apply inertia
      if (dragMoved && !dragState.isHorizontal && Math.abs(dragState.velocityY) > 0.3) {
        let velocity = dragState.velocityY * 15;
        const el = dragState.el;
        const decelerate = () => {
          velocity *= 0.95;
          el.scrollTop -= velocity;
          if (Math.abs(velocity) > 0.5) {
            dragState!.animFrame = requestAnimationFrame(decelerate);
          }
        };
        dragState.animFrame = requestAnimationFrame(decelerate);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseUp);

    // Inactivity reset (60s) — dispatch event instead of full reload to keep PWA cache warm
    let inactivityTimer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('totem:idle-reset'));
      }, 60000);
    };
    document.addEventListener('touchstart', resetTimer, { passive: true });
    document.addEventListener('mousedown', resetTimer);
    document.addEventListener('click', resetTimer);
    document.addEventListener('scroll', resetTimer, { passive: true });
    resetTimer();

    return () => {
      body.classList.remove('kiosk-mode');
      body.classList.remove('touch');
      if (viewportMeta && originalViewport) {
        viewportMeta.setAttribute('content', originalViewport);
      }
      document.removeEventListener('touchstart', passiveTouch);
      document.removeEventListener('contextmenu', blockContext);
      window.removeEventListener('wheel', blockZoom);
      window.removeEventListener('keydown', blockKeyZoom);
      document.removeEventListener('click', blockExternal);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mouseleave', onMouseUp);
      if (clickTimeout) clearTimeout(clickTimeout);
      document.removeEventListener('touchstart', resetTimer);
      document.removeEventListener('mousedown', resetTimer);
      document.removeEventListener('click', resetTimer);
      document.removeEventListener('scroll', resetTimer);
      clearTimeout(inactivityTimer);
      if (dragState?.animFrame) cancelAnimationFrame(dragState.animFrame);
    };
  }, []);
}

// ── Page with Auth Gate ──
export default function TotemPanel() {
  const { isAuthenticated, role } = useAuth();
  const [loggedIn, setLoggedIn] = useState(false);

  useKioskMode();

  useEffect(() => {
    if (isAuthenticated && (role === 'pdv' || role === 'admin')) setLoggedIn(true);
  }, [isAuthenticated, role]);

  if (!loggedIn) return <TotemLogin onLogin={() => setLoggedIn(true)} />;
  return <div className="totem-panel h-full w-full"><TotemKiosk /></div>;
}
