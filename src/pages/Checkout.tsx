import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { explodeCopaoToOrderItems } from '@/lib/copao-recipe';
import { useNavigate } from 'react-router-dom';
import { MapPin, CreditCard, Banknote, QrCode, Truck, ArrowLeft, Loader2, Copy, Check, Gift, Clock, Route, AlertTriangle, Ticket, X, Edit2 } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/integrations/supabase/client-safe';
// mapSettings no longer needed - using get_store_info RPC
import { STORE_INFO } from '@/lib/business-hours';
import { DeliveryMap } from '@/components/location/DeliveryMap';
import { DeliveryEstimate } from '@/components/location/DeliveryEstimate';
import { PixQRCodeModal } from '@/components/PixQRCodeModal';
import { CouponsModal } from '@/components/coupons/CouponsModal';
import { calculateDeliveryFee, DEFAULT_DELIVERY_CONFIG, type DeliveryFeeResult } from '@/lib/delivery-utils';
import { useUserCoupons } from '@/hooks/use-user-coupons';
import { usePublicCategories } from '@/hooks/use-public-data';
import { useAddresses } from '@/hooks/use-supabase-data';
import { useGoogleMaps } from '@/hooks/use-google-maps';
import { calculateCouponDiscount, type UserCoupon } from '@/lib/coupon-utils';
import { computeCartPromoDiscount, mapCartItemsForPromotions, useActivePromotions } from '@/lib/weekly-promotions';
import type { Settings, PaymentMethod } from '@/shared/schema';
import { PAYMENT_METHOD_LABELS } from '@/shared/schema';

export default function Checkout() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, combos, customDrinks, customDrinksTotal, subtotal, comboDiscount, beerDiscount, beerDiscountPercent, total: cartTotal, clearCart } = useCart();
  const { user, address: authAddress, isAuthenticated, isHydrated, role, setAddress: setAuthAddress } = useAuth();
  const { geocodeAddress } = useGoogleMaps();
  const activePromotions = useActivePromotions();

  // Guard: only customers can use checkout
  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated || (role && role !== 'customer')) {
      toast({ title: 'Faça login como cliente', description: 'O checkout é exclusivo para clientes.', variant: 'destructive' });
      navigate('/login?redirect=/checkout');
    }
  }, [isHydrated, isAuthenticated, role, navigate, toast]);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [pixCopied, setPixCopied] = useState(false);
  const [showPixModal, setShowPixModal] = useState(false);
  const [pixReferenceId, setPixReferenceId] = useState<string | null>(null);
  const [isCreatingPixOrder, setIsCreatingPixOrder] = useState(false);
  const [deliveryEstimate, setDeliveryEstimate] = useState<{ distance: number; duration: number } | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<UserCoupon | null>(null);
  const [showCouponsModal, setShowCouponsModal] = useState(false);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [isBackfillingAddressLocation, setIsBackfillingAddressLocation] = useState(false);
  const attemptedLocationFixesRef = useRef<Set<string>>(new Set());

  // IDEMPOTÊNCIA: clientRequestId estável por sessão de checkout.
  // Mantém o MESMO UUID em todas as tentativas até o pedido ser efetivamente criado,
  // garantindo que cliques duplos / retries de rede / reaberturas de modal PIX nunca
  // criem pedidos duplicados (UNIQUE index no banco bloqueia segunda inserção).
  const clientRequestIdRef = useRef<string>(
    (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );
  const regenerateClientRequestId = useCallback(() => {
    clientRequestIdRef.current = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  }, []);

  const { availableCoupons } = useUserCoupons();
  const { data: categories = [] } = usePublicCategories();
  const categoriesMap = categories.map(c => ({ id: c.id || '', name: c.name || '' }));

  // Fetch fresh addresses from DB to ensure we have the latest default address
  const { data: dbAddresses = [] } = useAddresses(user?.id || '', { enabled: !!user?.id });

  const buildAddressSearchText = useCallback(
    (targetAddress: typeof address) =>
      [
        targetAddress?.street,
        targetAddress?.number,
        targetAddress?.neighborhood,
        targetAddress?.city,
        targetAddress?.state,
        'Brasil',
      ]
        .filter(Boolean)
        .join(', '),
    []
  );

  // Use the freshest default address: DB first, auth context as fallback
  const address = useMemo(() => {
    if (dbAddresses.length > 0) {
      return dbAddresses.find(a => a.isDefault) || dbAddresses[0];
    }
    return authAddress;
  }, [dbAddresses, authAddress]);

  // Sync the resolved address back to the auth context as a side effect
  // (must run outside useMemo to avoid setState-during-render warnings)
  useEffect(() => {
    if (dbAddresses.length === 0) return;
    const defaultAddr = dbAddresses.find(a => a.isDefault) || dbAddresses[0];
    if (defaultAddr && (!authAddress || defaultAddr.id !== authAddress.id)) {
      setAuthAddress(defaultAddr);
    }
  }, [dbAddresses, authAddress, setAuthAddress]);

  const { data: settings } = useQuery<Settings | null>({
    queryKey: ['store-info'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_store_info');
      if (error) throw error;
      if (!data || (data as any[]).length === 0) return null;
      const row = (data as any[])[0];
      return {
        id: '',
        storeLat: row.store_lat != null ? String(row.store_lat) : null,
        storeLng: row.store_lng != null ? String(row.store_lng) : null,
        deliveryRatePerKm: String(row.delivery_rate_per_km ?? 1.5),
        minDeliveryFee: String(row.min_delivery_fee ?? 3),
        maxDeliveryDistance: String(row.max_delivery_distance ?? 15),
        pixKey: null,
        openingHours: row.opening_hours,
        isOpen: row.is_open,
        storeAddress: row.store_address,
      } as Settings;
    },
  });

  // Get store coordinates from settings
  const storeLocation = useMemo(() => {
    if (settings?.storeLat && settings?.storeLng) {
      return {
        lat: Number(settings.storeLat),
        lng: Number(settings.storeLng),
      };
    }
    // Fallback to São José dos Campos
    return { lat: -23.1791, lng: -45.8872 };
  }, [settings?.storeLat, settings?.storeLng]);

  // Haversine distance check - uses configured maxDeliveryDistance from settings
  const maxDistanceKm = Number(settings?.maxDeliveryDistance) || 15;
  const addressDistanceKm = useMemo(() => {
    if (address?.latitude == null || address?.longitude == null) return null;
    const R = 6371;
    const dLat = (storeLocation.lat - address.latitude) * Math.PI / 180;
    const dLng = (storeLocation.lng - address.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(address.latitude * Math.PI / 180) * Math.cos(storeLocation.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [address?.latitude, address?.longitude, storeLocation]);
  
  const isAddressTooFar = addressDistanceKm !== null && addressDistanceKm > maxDistanceKm;

  // Calculate delivery fee dynamically based on distance
  // Use Haversine as fallback if Google Maps estimate isn't available yet
  const haversineDistanceMeters = useMemo(() => {
    if (address?.latitude == null || address?.longitude == null) return null;
    const R = 6371000;
    const dLat = (storeLocation.lat - address.latitude) * Math.PI / 180;
    const dLng = (storeLocation.lng - address.longitude) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(address.latitude * Math.PI / 180) * Math.cos(storeLocation.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, [address?.latitude, address?.longitude, storeLocation]);

  const deliveryFeeResult = useMemo<DeliveryFeeResult | null>(() => {
    const distanceMeters = deliveryEstimate?.distance || haversineDistanceMeters;
    if (!distanceMeters) return null;
    
    const config = {
      minFee: Number(settings?.minDeliveryFee) || DEFAULT_DELIVERY_CONFIG.minFee,
      ratePerKm: Number(settings?.deliveryRatePerKm) || DEFAULT_DELIVERY_CONFIG.ratePerKm,
      maxDistance: Number(settings?.maxDeliveryDistance) || DEFAULT_DELIVERY_CONFIG.maxDistance,
    };
    
    return calculateDeliveryFee(distanceMeters, config);
  }, [deliveryEstimate?.distance, haversineDistanceMeters, settings?.minDeliveryFee, settings?.deliveryRatePerKm, settings?.maxDeliveryDistance]);

  // Sem coordenadas → não conseguimos calcular: operador ajusta a taxa manualmente.
  const hasCoords = address?.latitude != null && address?.longitude != null;
  const deliveryFee = deliveryFeeResult?.fee ?? (hasCoords ? Number(settings?.minDeliveryFee ?? 3) : 0);
  const isManualDeliveryFee = !hasCoords;

  useEffect(() => {
    if (!user?.id || !address?.id || (address.latitude != null && address.longitude != null)) {
      return;
    }

    const attemptKey = [address.id, address.street, address.number, address.neighborhood, address.city, address.state]
      .filter(Boolean)
      .join('|');

    if (attemptedLocationFixesRef.current.has(attemptKey)) {
      return;
    }

    attemptedLocationFixesRef.current.add(attemptKey);

    let isCancelled = false;

    const backfillAddressLocation = async () => {
      setIsBackfillingAddressLocation(true);

      try {
        const geocoded = await geocodeAddress(buildAddressSearchText(address));

        if (!geocoded?.latitude || !geocoded?.longitude) {
          return;
        }

        const updatedAddress = {
          ...address,
          zipCode: address.zipCode || geocoded.zipCode || '',
          latitude: geocoded.latitude,
          longitude: geocoded.longitude,
        };

        const { error } = await supabase.rpc('update_user_address', {
          p_address_id: address.id,
          p_user_id: user.id,
          p_street: updatedAddress.street,
          p_number: updatedAddress.number,
          p_neighborhood: updatedAddress.neighborhood,
          p_city: updatedAddress.city,
          p_state: updatedAddress.state,
          p_complement: updatedAddress.complement || undefined,
          p_zip_code: updatedAddress.zipCode || undefined,
          p_notes: updatedAddress.notes || undefined,
          p_latitude: updatedAddress.latitude,
          p_longitude: updatedAddress.longitude,
        });

        if (error) {
          throw error;
        }

        if (!isCancelled) {
          setAuthAddress(updatedAddress);
          queryClient.invalidateQueries({ queryKey: ['addresses', user.id] });
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Checkout] Failed to backfill address coordinates:', error);
        }
      } finally {
        if (!isCancelled) {
          setIsBackfillingAddressLocation(false);
        }
      }
    };

    backfillAddressLocation();

    return () => {
      isCancelled = true;
    };
  }, [
    address,
    buildAddressSearchText,
    geocodeAddress,
    setAuthAddress,
    user?.id,
  ]);

  // Calculate coupon discount
  const couponDiscountResult = useMemo(() => {
    if (!selectedCoupon) return null;
    return calculateCouponDiscount(selectedCoupon, items, cartTotal, categoriesMap);
  }, [selectedCoupon, items, cartTotal, categoriesMap]);

  const couponDiscount = couponDiscountResult?.eligible ? couponDiscountResult.discount : 0;
  const promotionResult = useMemo(() => {
    return computeCartPromoDiscount(mapCartItemsForPromotions(items, customDrinks), activePromotions);
  }, [items, customDrinks, activePromotions]);
  const promotionDiscount = promotionResult.total;
  const total = cartTotal + deliveryFee - couponDiscount;

  // Pedido mínimo de R$20 (exceto PDV e Totem)
  const MIN_ORDER_VALUE = 20;
  const isBelowMinimum = cartTotal < MIN_ORDER_VALUE;

  // Handler for when DeliveryEstimate calculates the distance
  const handleEstimateChange = useCallback((estimate: { distance: number; duration: number } | null) => {
    setDeliveryEstimate(estimate);
  }, []);

  // Helper to create order (used for non-PIX and after PIX approval)
  const createOrderAsync = async (mpPaymentId?: string) => {
    if (!user?.id) throw new Error('Você precisa estar logado para fazer um pedido.');
    if (!address?.id) throw new Error('Endereço não encontrado.');

    const totalDiscount = comboDiscount + beerDiscount + promotionDiscount + couponDiscount;
    const orderSubtotal = subtotal + customDrinksTotal;
    const distanceKm = deliveryFeeResult?.distanceKm ?? (haversineDistanceMeters ? haversineDistanceMeters / 1000 : 0);

    const noteParts: string[] = [];
    if (mpPaymentId) noteParts.push(`✅ PIX PAGO - MP #${mpPaymentId}`);
    if (isManualDeliveryFee) noteParts.push('⚠️ TAXA DE ENTREGA A AJUSTAR PELO OPERADOR (sem geolocalização)');

    // Build items first — pedido + itens em transação ATÔMICA via RPC única
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const orderItemsData = [
      ...items.map(item => ({
        product_id: isValidUUID(item.productId) ? item.productId : null,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: Number(item.product.salePrice),
        total_price: Number(item.product.salePrice) * item.quantity,
        is_wizard_item: false,
      })),
      ...customDrinks.flatMap(drink => explodeCopaoToOrderItems(drink)),
    ];

    if (orderItemsData.length === 0) {
      throw new Error('Carrinho vazio. Adicione pelo menos um item antes de finalizar.');
    }

    // CRITICAL: never pass `undefined` — PostgREST omits the field and fails to find the RPC overload
    // ("Could not find function ... in schema cache"). Always use `null` for optional parameters.
    // Idempotência: client_request_id estável (vem do ref) — retries usam o mesmo UUID
    // e o UNIQUE index `uniq_orders_user_client_request_id` impede duplicação.
    const rpcPayload = {
      p_user_id: user.id,
      p_address_id: address.id,
      p_subtotal: orderSubtotal,
      p_delivery_fee: deliveryFee,
      p_discount: totalDiscount,
      p_total: total,
      p_payment_method: paymentMethod,
      p_items: JSON.stringify(orderItemsData),
      p_change_for: paymentMethod === 'cash' && needsChange ? Number(changeFor) : null,
      p_notes: noteParts.length > 0 ? noteParts.join(' | ') : null,
      p_delivery_distance: Math.round(distanceKm * 100) / 100,
      p_client_request_id: clientRequestIdRef.current,
    };

    // RPC SECURITY DEFINER cria pedido + itens em transação atômica e bypassa RLS para
    // clientes autenticados via login custom (CPF/whatsapp), que não possuem auth.uid().
    // Em retry de rede, a mesma client_request_id retorna o pedido existente sem duplicar.
    const { data: rpcResult, error: orderError } = await supabase.rpc('create_delivery_order_with_items' as any, rpcPayload);

    if (orderError || !rpcResult) {
      console.error('[Checkout] RPC create_delivery_order_with_items failed:', orderError);
      throw new Error(`Erro ao criar pedido: ${orderError?.message || 'Falha ao registrar pedido. Tente novamente.'}`);
    }

    const orderId = rpcResult as string;

    // Para PIX, marca o pedido como pago via RPC SECURITY DEFINER
    // (cliente custom não tem auth.uid() e seria barrado pela RLS de UPDATE em orders).
    // O trigger trg_auto_accept_on_pix_confirm move pending → accepted automaticamente,
    // garantindo que o pedido apareça no LOG/Cozinha.
    if (mpPaymentId) {
      const { error: confirmErr } = await supabase.rpc('confirm_pix_payment_for_order' as any, {
        p_order_id: orderId,
        p_mp_payment_id: mpPaymentId,
        p_user_id: user.id,
      });
      if (confirmErr) {
        console.error('[Checkout] Falha CRÍTICA ao confirmar PIX no pedido:', confirmErr);
        // Não bloqueia o usuário (pagamento já foi feito), mas alerta
        toast({
          title: '⚠️ Pedido criado, confirmando pagamento...',
          description: 'Caso o pedido não apareça em "Meus Pedidos", contate a loja.',
          variant: 'destructive',
        });
      }
    }

    if (!orderId) throw new Error('Pedido não foi criado. Tente novamente.');

    // Mark coupon as used
    if (selectedCoupon) {
      try {
        await supabase.rpc('use_coupon_admin', {
          p_user_id: user.id,
          p_user_coupon_id: selectedCoupon.id,
          p_order_id: orderId,
        });
      } catch { /* non-critical */ }
    }

    return orderId;
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      return await createOrderAsync();
    },
    onSuccess: () => {
      clearCart();
      setSelectedCoupon(null);
      regenerateClientRequestId(); // Próxima compra usa novo UUID
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-coupons'] });
      sonnerToast.success('Seu pedido foi criado com sucesso, basta acompanhar o pedido aqui mesmo no seu aplicativo', { duration: 10000 });
      navigate('/pedidos');
    },
    onError: (error: Error) => {
      // Erro de duplicidade (UNIQUE index) → mensagem amigável e NÃO regenera UUID
      const isDuplicate = error.message?.includes('uniq_orders_user_client_request_id') ||
                          error.message?.toLowerCase().includes('duplicate key');
      toast({
        title: isDuplicate ? 'Pedido já registrado' : 'Erro ao criar pedido',
        description: isDuplicate
          ? 'Seu pedido foi recebido. Acompanhe em "Meus Pedidos".'
          : error.message,
        variant: isDuplicate ? 'default' : 'destructive',
      });
    },
  });

  const handlePlaceOrder = async () => {
    // Trava única: bloqueia clique se mutation pending OU se PIX já está sendo criado
    if (createOrderMutation.isPending || isCreatingPixOrder) return;

    if (!addressConfirmed) {
      toast({
        title: 'Confirme o endereço',
        description: 'Confirme seu endereço de entrega antes de finalizar.',
        variant: 'destructive',
      });
      return;
    }

    if (isBackfillingAddressLocation) {
      toast({
        title: 'Atualizando localização',
        description: 'Estamos localizando seu endereço para calcular a entrega.',
      });
      return;
    }
    
    // Block if address is beyond configured max distance
    if (isAddressTooFar) {
      toast({
        title: 'Endereço fora da área de entrega',
        description: `Seu endereço está a ${addressDistanceKm?.toFixed(1)}km. O limite é ${maxDistanceKm}km.`,
        variant: 'destructive',
      });
      return;
    }

    // Sem coordenadas → seguimos com taxa = 0 e operador ajusta manualmente.
    // (Aviso já é exibido no card de endereço.)
    if (hasCoords && !deliveryFeeResult) {
      toast({
        title: 'Calculando taxa de entrega...',
        description: 'Aguarde o cálculo da taxa de entrega antes de confirmar.',
        variant: 'destructive',
      });
      return;
    }
    
    // PIX: cria o pedido PRIMEIRO (status pending) e SÓ DEPOIS gera o QR Code.
    // Garante que o pedido sempre exista no admin/KDE/log mesmo se o cliente fechar
    // o app durante o pagamento. Se o PIX expirar, o cron expire-pix-orders cancela.
    if (paymentMethod === 'pix') {
      setIsCreatingPixOrder(true);
      try {
        const orderId = await createOrderAsync();
        if (import.meta.env.DEV) console.log('[Checkout] PIX order pre-created:', orderId);
        setPixReferenceId(orderId);
        setShowPixModal(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar pedido';
        toast({ title: 'Erro ao iniciar pagamento PIX', description: msg, variant: 'destructive' });
      } finally {
        setIsCreatingPixOrder(false);
      }
    } else {
      createOrderMutation.mutate();
    }
  };

  const handlePixPaymentApproved = async (mpPaymentId?: string) => {
    // Pedido JÁ foi criado antes do modal abrir (pixReferenceId = orderId real).
    // Apenas confirmamos o pagamento via RPC (trigger move pending → accepted).
    setIsCreatingPixOrder(true);
    try {
      const orderId = pixReferenceId;
      if (!orderId) throw new Error('Referência do pedido perdida.');

      if (mpPaymentId && user?.id) {
        const { error: confirmErr } = await supabase.rpc('confirm_pix_payment_for_order' as any, {
          p_order_id: orderId,
          p_mp_payment_id: mpPaymentId,
          p_user_id: user.id,
        });
        if (confirmErr) {
          console.error('[Checkout] Falha ao confirmar PIX (pedido já existe):', confirmErr);
          toast({
            title: '⚠️ Pagamento recebido, confirmando...',
            description: 'Seu pedido foi criado. Caso não apareça em "Meus Pedidos", contate a loja.',
          });
        }
      }

      clearCart();
      setSelectedCoupon(null);
      regenerateClientRequestId(); // Próxima compra usa novo UUID
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['user-coupons'] });
      setShowPixModal(false);
      setPixReferenceId(null);
      toast({ title: '✅ Pedido confirmado!', description: 'Seu pedido foi criado com sucesso.' });
      navigate('/pedidos');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao confirmar pedido';
      toast({ title: 'Erro ao confirmar pedido', description: msg, variant: 'destructive' });
    } finally {
      setIsCreatingPixOrder(false);
    }
  };

  const handlePixPaymentCancelled = () => {
    setPixReferenceId(null);
    setShowPixModal(false);
    toast({
      title: 'Pagamento PIX cancelado',
      description: 'Nenhum pedido foi criado. Você pode tentar novamente ou escolher outra forma de pagamento.',
    });
    // No order was created — user stays on checkout
  };

  const handlePixPaymentExpired = () => {
    setPixReferenceId(null);
    setShowPixModal(false);
    toast({
      title: 'Tempo esgotado',
      description: 'Selecione outra forma de pagamento ou tente PIX novamente.',
    });
    // User stays on checkout to pick another method
  };

  const copyPixKey = () => {
    if (settings?.pixKey) {
      navigator.clipboard.writeText(settings.pixKey);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
      toast({ title: 'Chave PIX copiada!' });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const isOpen = settings?.isOpen !== false;

  // Redirect to login if not authenticated (wait for hydration)
  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      navigate('/login?redirect=/checkout');
    }
  }, [isAuthenticated, navigate, isHydrated]);

  // Redirect to home if cart is empty
  useEffect(() => {
    if (items.length === 0 && customDrinks.length === 0) {
      navigate('/');
    }
  }, [items.length, customDrinks.length, navigate]);

  // Show loading while checking auth
  if (!isAuthenticated || (items.length === 0 && customDrinks.length === 0)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Use saved address or require it to be filled
  const finalAddress = address || { street: '', number: '', complement: '', neighborhood: '', city: 'Sao Paulo', state: 'SP', zipCode: '', notes: '' };

  return (
    <div className="min-h-screen bg-background py-8 px-4 pb-safe-area overflow-x-hidden">
      <div className="max-w-4xl mx-auto pb-8">
        <Button
          variant="ghost"
          className="mb-6 text-primary"
          onClick={() => navigate('/')}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5 mr-2" />
          Voltar ao cardapio
        </Button>

        {!isOpen && (
          <Card className="mb-6 border-red-500/30 bg-red-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-red-400">
                <Clock className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">{STORE_INFO.STORE_NAME} - Fechado</p>
                  <p className="text-sm">Estamos fechados no momento. Acompanhe nossas redes para saber quando reabriremos!</p>
                  <p className="text-xs mt-1 text-muted-foreground">{STORE_INFO.ADDRESS}</p>
                  <p className="text-xs mt-2">Entre em contato: <a href={STORE_INFO.WHATSAPP_LINK} className="text-green-400 hover:underline" target="_blank" rel="noopener noreferrer">WhatsApp {STORE_INFO.WHATSAPP}</a></p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <h1 className="font-serif text-3xl text-primary mb-8">Finalizar Pedido</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <MapPin className="h-5 w-5 text-primary" />
                  Endereço de Entrega
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!addressConfirmed ? (
                  /* Address confirmation step */
                  <div className="space-y-4">
                    {address ? (
                      <>
                        <div className="p-4 rounded-lg border bg-secondary/50 border-primary/10">
                          <p className="font-medium text-foreground">{user?.name}</p>
                          <p className="text-muted-foreground text-sm mt-1">
                            {address.street}, {address.number}
                            {address.complement && ` - ${address.complement}`}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {address.neighborhood} - {address.city || 'São José dos Campos'}, {address.state || 'SP'}
                          </p>
                          {address.notes && (
                            <p className="text-primary text-sm mt-2">Obs: {address.notes}</p>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Deseja entregar neste endereço?
                        </p>
                        <div className="flex gap-3">
                          <Button
                            className="flex-1 bg-primary text-primary-foreground"
                            onClick={() => setAddressConfirmed(true)}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Usar este endereço
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 border-primary/30 text-primary"
                            onClick={() => navigate('/perfil')}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Alterar endereço
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-4 space-y-3">
                        <MapPin className="h-10 w-10 mx-auto text-muted-foreground" />
                        <p className="text-muted-foreground">Nenhum endereço cadastrado.</p>
                        <Button
                          className="bg-primary text-primary-foreground"
                          onClick={() => navigate('/perfil')}
                        >
                          Cadastrar endereço
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Confirmed address display */
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <Check className="h-3 w-3 mr-1" />
                        Endereço confirmado
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary text-xs"
                        onClick={() => setAddressConfirmed(false)}
                      >
                        Trocar
                      </Button>
                    </div>
                    <div className={`p-4 rounded-lg border ${isAddressTooFar ? 'bg-destructive/10 border-destructive/30' : 'bg-secondary/50 border-primary/10'}`}>
                      <p className="font-medium text-foreground">{user?.name}</p>
                      {address ? (
                        <>
                          <p className="text-muted-foreground text-sm mt-1">
                            {address.street}, {address.number}
                            {address.complement && ` - ${address.complement}`}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {address.neighborhood} - {address.city || 'São José dos Campos'}, {address.state || 'SP'}
                          </p>
                          {address.notes && (
                            <p className="text-primary text-sm mt-2">Obs: {address.notes}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-muted-foreground text-sm mt-1">Endereço não preenchido.</p>
                      )}
                    </div>

                    {/* Distance too far warning */}
                    {isAddressTooFar && (
                      <div className="mt-3 flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Endereço fora da área de entrega</p>
                          <p className="text-xs mt-0.5">
                            Distância: {addressDistanceKm?.toFixed(1)}km (máximo: {maxDistanceKm}km). 
                            Por favor, altere seu endereço.
                          </p>
                        </div>
                      </div>
                    )}

                    {address && (address.latitude == null || address.longitude == null) && (
                      <div className="mt-3 flex items-center gap-2 text-sm bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/40">
                        {isBackfillingAddressLocation ? (
                          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-yellow-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-yellow-600" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">
                            {isBackfillingAddressLocation ? 'Localizando seu endereço...' : 'Serviços de geolocalização indisponíveis'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isBackfillingAddressLocation
                              ? 'Tentando localizar automaticamente...'
                              : 'Você pode finalizar o pedido normalmente — a taxa de entrega será adicionada manualmente pelo operador até a normalização do serviço.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Mini Map & Delivery Estimate */}
                    {address?.latitude != null && address?.longitude != null && !isAddressTooFar && (
                      <div className="mt-4 space-y-3">
                        <DeliveryMap
                          storeLocation={storeLocation}
                          deliveryLocation={{ lat: address.latitude, lng: address.longitude }}
                          className="h-[180px]"
                        />
                        <DeliveryEstimate
                          storeLocation={storeLocation}
                          deliveryLocation={{ lat: address.latitude, lng: address.longitude }}
                          onEstimateChange={handleEstimateChange}
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Forma de Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  className="space-y-3"
                >
                  <div 
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === 'pix' ? 'border-primary bg-primary/10' : 'border-primary/20 bg-secondary/30'
                    }`}
                    onClick={() => setPaymentMethod('pix')}
                  >
                    <RadioGroupItem value="pix" id="pix" className="border-primary" />
                    <QrCode className="h-5 w-5 text-primary" />
                    <Label htmlFor="pix" className="flex-1 cursor-pointer text-foreground">
                      PIX
                      <span className="block text-xs text-muted-foreground">Pagamento instantaneo</span>
                    </Label>
                  </div>

                  <div 
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === 'cash' ? 'border-primary bg-primary/10' : 'border-primary/20 bg-secondary/30'
                    }`}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <RadioGroupItem value="cash" id="cash" className="border-primary" />
                    <Banknote className="h-5 w-5 text-primary" />
                    <Label htmlFor="cash" className="flex-1 cursor-pointer text-foreground">
                      Dinheiro
                      <span className="block text-xs text-muted-foreground">Pague na entrega</span>
                    </Label>
                  </div>

                  <div 
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      paymentMethod === 'card_pos' ? 'border-primary bg-primary/10' : 'border-primary/20 bg-secondary/30'
                    }`}
                    onClick={() => setPaymentMethod('card_pos')}
                  >
                    <RadioGroupItem value="card_pos" id="card_pos" className="border-primary" />
                    <CreditCard className="h-5 w-5 text-primary" />
                    <Label htmlFor="card_pos" className="flex-1 cursor-pointer text-foreground">
                      Cartao (Maquininha)
                      <span className="block text-xs text-muted-foreground">Credito ou debito na entrega</span>
                    </Label>
                  </div>
                </RadioGroup>

                {paymentMethod === 'cash' && (
                  <div className="mt-4 p-4 bg-secondary/50 rounded-lg border border-primary/10">
                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="checkbox"
                        id="needs-change"
                        checked={needsChange}
                        onChange={(e) => setNeedsChange(e.target.checked)}
                        className="rounded border-primary"
                      />
                      <Label htmlFor="needs-change" className="text-foreground">Preciso de troco</Label>
                    </div>
                    {needsChange && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Troco para quanto?</Label>
                        <CurrencyInput
                          value={changeFor}
                          onChange={(v) => setChangeFor(String(v))}
                          placeholder="0,00"
                          className="mt-1 bg-secondary border-primary/30 text-foreground"
                          data-testid="input-change-for"
                        />
                      </div>
                    )}
                  </div>
                )}

                {paymentMethod === 'pix' && (
                  <div className="mt-4 space-y-3">
                    <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <QrCode className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <p className="font-medium text-green-400 mb-1">Pagamento PIX Instantâneo</p>
                          <p className="text-sm text-muted-foreground">
                            Ao confirmar, será gerado um QR Code do Mercado Pago para pagamento imediato.
                          </p>
                          <p className="text-xs text-green-500/80 mt-2">
                            Pagamento confirmado automaticamente em segundos!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-400 mb-1">Atenção — Política de Estorno PIX</p>
                          <p className="text-sm text-muted-foreground">
                            Pagamentos PIX em nosso sistema não possuem devolução automática em caso de cancelamento. Caso precise estornar, entre em contato pelo WhatsApp para solicitar o reembolso manual.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="bg-card border-primary/20 sticky top-4">
              <CardHeader>
                <CardTitle className="text-foreground">Resumo do Pedido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.productId} className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground truncate min-w-0">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span className="text-foreground flex-shrink-0">
                        {formatPrice(Number(item.product.salePrice) * item.quantity)}
                      </span>
                    </div>
                  ))}
                  {customDrinks.map((drink) => (
                    <div key={drink.id} className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground truncate min-w-0">
                        🍸 {drink.name}
                      </span>
                      <span className="text-foreground flex-shrink-0">
                        {formatPrice(drink.totalPrice)}
                      </span>
                    </div>
                  ))}
                </div>

                <Separator className="bg-primary/20" />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">{formatPrice(subtotal + customDrinksTotal)}</span>
                  </div>
                  {customDrinksTotal > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground pl-2">
                      <span>↳ Inclui drinks montados</span>
                      <span>{formatPrice(customDrinksTotal)}</span>
                    </div>
                  )}

                  {comboDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-500 flex items-center gap-1">
                        <Gift className="h-3 w-3" />
                        Desconto Combo (10%)
                      </span>
                      <span className="text-green-500" data-testid="text-combo-discount">
                        - {formatPrice(comboDiscount)}
                      </span>
                    </div>
                  )}

                  {beerDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-500 flex items-center gap-1">
                        🍺 Cerveja ({beerDiscountPercent}%)
                      </span>
                      <span className="text-green-500">
                        - {formatPrice(beerDiscount)}
                      </span>
                    </div>
                  )}

                  {promotionDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-500 flex items-center gap-1 min-w-0">
                        🎁 <span className="truncate">Promoção Semanal{promotionResult.matches[0]?.match?.promo?.name ? `: ${promotionResult.matches[0].match.promo.name}` : ''}</span>
                      </span>
                      <span className="text-green-500 shrink-0">
                        - {formatPrice(promotionDiscount)}
                      </span>
                    </div>
                  )}

                  {/* Coupon discount */}
                  {selectedCoupon && couponDiscountResult?.eligible && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-500 flex items-center gap-1">
                        <Ticket className="h-3 w-3" />
                        Cupom {selectedCoupon.code}
                      </span>
                      <span className="text-green-500">
                        - {formatPrice(couponDiscount)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3" />
                      Taxa de entrega
                      {deliveryFeeResult && deliveryFeeResult.distanceKm > 1 && (
                        <span className="text-xs">({deliveryFeeResult.distanceKm.toFixed(1)}km)</span>
                      )}
                    </span>
                    <span className="text-foreground" data-testid="text-delivery-fee">
                      {formatPrice(deliveryFee)}
                    </span>
                  </div>
                  
                  {/* Delivery fee breakdown */}
                  {deliveryFeeResult && deliveryFeeResult.distanceKm > 1 && (
                    <div className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded">
                      R$ {deliveryFeeResult.breakdown.baseFee.toFixed(2)} base + {deliveryFeeResult.breakdown.additionalKm}km × R$ {(Number(settings?.deliveryRatePerKm) || 1).toFixed(2)} = R$ {deliveryFeeResult.fee.toFixed(2)}
                    </div>
                  )}
                  
                  {/* Out of range warning */}
                  {deliveryFeeResult && !deliveryFeeResult.isWithinRange && (
                    <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 p-2 rounded">
                      <AlertTriangle className="h-3 w-3" />
                      Endereço fora da área de entrega ({deliveryFeeResult.distanceKm.toFixed(1)}km)
                    </div>
                  )}
                </div>

                {/* Coupon section */}
                <div className="space-y-2">
                  {selectedCoupon ? (
                    <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-green-500" />
                        <div>
                          <span className="font-mono font-medium text-green-500">{selectedCoupon.code}</span>
                          {couponDiscountResult?.appliedTo && (
                            <p className="text-xs text-green-500/80">{couponDiscountResult.appliedTo}</p>
                          )}
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-green-500 hover:text-red-500"
                        onClick={() => setSelectedCoupon(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : availableCoupons.length > 0 ? (
                    <Button
                      variant="outline"
                      className="w-full border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
                      onClick={() => setShowCouponsModal(true)}
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Você tem {availableCoupons.length} cupom{availableCoupons.length > 1 ? 's' : ''} disponível!
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => setShowCouponsModal(true)}
                    >
                      <Ticket className="h-4 w-4 mr-2" />
                      Aplicar cupom
                    </Button>
                  )}
                </div>

                <Separator className="bg-primary/20" />

                <div className="flex justify-between">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-bold text-xl text-primary" data-testid="text-total">
                    {formatPrice(total)}
                  </span>
                </div>

                <Button
                  className="w-full bg-primary text-primary-foreground font-semibold py-6 min-h-[56px] mb-4"
                  onClick={handlePlaceOrder}
                  disabled={createOrderMutation.isPending || isCreatingPixOrder || showPixModal || isBackfillingAddressLocation || !isOpen || isAddressTooFar || !address || !deliveryFeeResult || isBelowMinimum}
                  data-testid="button-place-order"
                  style={{ marginBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}
                >
                  {isAddressTooFar ? (
                    'Endereço fora da área de entrega'
                  ) : !address ? (
                    'Cadastre um endereço'
                  ) : isBackfillingAddressLocation ? (
                    'Localizando endereço...'
                  ) : address.latitude == null || address.longitude == null ? (
                    'Endereço sem localização - Atualize no perfil'
                  ) : !isOpen ? (
                    'Estabelecimento Fechado'
                  ) : !deliveryFeeResult ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Calculando entrega...
                    </>
                  ) : isCreatingPixOrder || createOrderMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Processando pedido...
                    </>
                  ) : showPixModal ? (
                    'Aguardando pagamento PIX...'
                  ) : isBelowMinimum ? (
                    `Pedido mínimo R$ ${MIN_ORDER_VALUE.toFixed(2)} (faltam ${formatPrice(MIN_ORDER_VALUE - cartTotal)})`
                  ) : (
                    `Confirmar Pedido - ${formatPrice(total)}`
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* PIX QR Code Modal */}
      <PixQRCodeModal
        open={showPixModal}
        onOpenChange={setShowPixModal}
        amount={total}
        description={`Pedido Delivery - VM Brasil`}
        referenceId={pixReferenceId || ''}
        onPaymentApproved={handlePixPaymentApproved}
        onPaymentCancelled={handlePixPaymentCancelled}
        onPaymentExpired={handlePixPaymentExpired}
        isDelivery={true}
      />

      {/* Coupons Selection Modal */}
      <CouponsModal
        open={showCouponsModal}
        onOpenChange={setShowCouponsModal}
        selectable={true}
        onSelectCoupon={setSelectedCoupon}
      />

    </div>
  );
}
