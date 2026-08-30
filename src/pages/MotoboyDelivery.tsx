import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, MapPin, Phone, Navigation, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { useMotoboyTracking } from '@/hooks/use-motoboy-tracking';
import { supabase } from '@/integrations/supabase/client-safe';
import { mapAddress, mapOrder, mapMotoboy } from '@/lib/db-mappers';
import { queryClient } from '@/lib/queryClient';
import { EmbeddedNavigationMap } from '@/components/motoboy/EmbeddedNavigationMap';
import type { Order, Address, Motoboy } from '@/shared/schema';

interface LiveLoc { lat: number; lng: number; ts: number }

export default function MotoboyDelivery() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, role, isHydrated } = useAuth();
  const motoboyId = user?.id || '';
  const isAuthorized = isHydrated && (role === 'motoboy' || role === 'admin');
  const [liveLoc, setLiveLoc] = useState<LiveLoc | null>(() => {
    try {
      const raw = localStorage.getItem('motoboy:lastLoc');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (isHydrated && !isAuthorized) navigate('/');
  }, [isHydrated, isAuthorized, navigate]);

  // Self
  const { data: motoboy } = useQuery<Motoboy | null>({
    queryKey: ['motoboy-self', motoboyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_motoboy_self', { p_motoboy_id: motoboyId });
      if (error) return null;
      return (data || []).map(mapMotoboy)[0] || null;
    },
    enabled: !!motoboyId,
  });

  // Orders → find current
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ['motoboy-orders', motoboyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_motoboy_orders', { p_motoboy_id: motoboyId });
      if (error) return [];
      return (data || []).map(mapOrder);
    },
    enabled: !!motoboy?.id,
    refetchInterval: 10000,
  });

  const order = orders.find(o => o.id === orderId);

  // Address
  const { data: addresses = [] } = useQuery<Address[]>({
    queryKey: ['motoboy-addresses', motoboyId, order?.addressId],
    queryFn: async () => {
      if (!order?.addressId) return [];
      const { data, error } = await supabase.rpc('get_motoboy_addresses', {
        p_motoboy_id: motoboyId,
        p_address_ids: [order.addressId],
      });
      if (error) return [];
      return (data || []).map(mapAddress);
    },
    enabled: !!order?.addressId,
  });
  const address = addresses[0];

  // User contact
  const { data: users = [] } = useQuery<{ id: string; name: string; whatsapp: string }[]>({
    queryKey: ['motoboy-order-users', motoboyId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_motoboy_order_users', { p_motoboy_id: motoboyId });
      if (error) return [];
      return data || [];
    },
    enabled: !!motoboy?.id,
  });
  const customer = users.find(u => u.id === order?.userId);

  // Tracking — high frequency (3s) while on this screen
  const { isTracking, permissionStatus, lastError, startTracking } = useMotoboyTracking({
    motoboyId: motoboy?.id || '',
    orderId,
    enabled: !!motoboy?.id,
    updateInterval: 3000,
  });

  // Read latest motoboy GPS via realtime + persist to localStorage
  useEffect(() => {
    if (!motoboy?.id) return;
    // initial seed from motoboy record
    const m: any = motoboy;
    if (m.currentLatitude && m.currentLongitude) {
      const next = { lat: m.currentLatitude, lng: m.currentLongitude, ts: Date.now() };
      setLiveLoc(next);
      try { localStorage.setItem('motoboy:lastLoc', JSON.stringify(next)); } catch {}
    }
    const channel = supabase
      .channel(`nav-motoboy-${motoboy.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'motoboy_locations',
        filter: `motoboy_id=eq.${motoboy.id}`,
      }, (payload) => {
        const p: any = payload.new;
        const next = { lat: Number(p.latitude), lng: Number(p.longitude), ts: Date.now() };
        setLiveLoc(next);
        try { localStorage.setItem('motoboy:lastLoc', JSON.stringify(next)); } catch {}
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [motoboy?.id]);

  const destination = useMemo(() => {
    if (address?.latitude && address?.longitude) {
      return { lat: Number(address.latitude), lng: Number(address.longitude) };
    }
    return null;
  }, [address]);

  const confirmPickup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('confirm_pickup_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      toast({ title: '✅ Coleta confirmada! Agora siga para a entrega.' });
    },
    onError: () => toast({ title: 'Erro ao confirmar coleta', variant: 'destructive' }),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: 'arrived') => {
      const now = new Date().toISOString();
      const { error } = await supabase.rpc('update_order_status_motoboy', {
        p_motoboy_id: motoboyId,
        p_order_id: orderId,
        p_status: status,
        p_arrived_at: status === 'arrived' ? now : undefined,
        p_delivered_at: undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['motoboy-orders'] });
      toast({ title: 'Chegada confirmada! Volte ao card para finalizar.' });
    },
    onError: () => toast({ title: 'Erro ao atualizar', variant: 'destructive' }),
  });

  const openExternalMaps = () => {
    if (!destination) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination.lat},${destination.lng}&travelmode=driving`, '_blank');
  };

  const openWhatsApp = () => {
    if (customer?.whatsapp) window.open(`https://wa.me/55${customer.whatsapp}`, '_blank');
  };

  if (!isAuthorized) return null;

  if (!order || !destination) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6 gap-4">
        <p className="text-muted-foreground text-center">Pedido não encontrado ou sem coordenadas de entrega.</p>
        <Button onClick={() => navigate('/motoboy')}><ArrowLeft className="w-4 h-4 mr-2"/>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden" style={{ height: '100dvh' }}>
      {/* Map (fills) */}
      <div className="flex-1 relative min-h-0">
        <EmbeddedNavigationMap
          origin={liveLoc ? { lat: liveLoc.lat, lng: liveLoc.lng } : null}
          destination={destination}
          className="absolute inset-0"
        />

        {/* Back button */}
        <button
          onClick={() => navigate('/motoboy')}
          className="absolute top-4 left-4 z-30 w-11 h-11 rounded-full bg-card/95 shadow-lg flex items-center justify-center border border-border"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* External map fallback */}
        <button
          onClick={openExternalMaps}
          className="absolute top-4 right-4 z-30 px-3 h-11 rounded-full bg-card/95 shadow-lg flex items-center gap-1 text-xs font-medium text-foreground border border-border"
        >
          <ExternalLink className="w-4 h-4" /> Maps
        </button>
      </div>

      {/* Bottom action sheet */}
      <div className="flex-shrink-0 bg-card border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-start gap-3 mb-3 min-w-0">
          <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{customer?.name || order.customerName || 'Cliente'}</div>
            <div className="text-sm text-muted-foreground line-clamp-2">
              {address?.street}, {address?.number} — {address?.neighborhood}
            </div>
            {address?.complement && (
              <div className="text-xs text-muted-foreground truncate">Compl: {address.complement}</div>
            )}
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-bold text-primary">R$ {Number(order.total || 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="mb-3 rounded-lg bg-secondary/60 border border-border p-2 text-xs text-muted-foreground">
          GPS: {isTracking ? 'ativo e enviando localização' : permissionStatus === 'denied' ? 'permissão negada' : 'tentando ativar'}
          {lastError && <span className="block text-destructive mt-1">{lastError}</span>}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="h-12"
            onClick={openWhatsApp}
            disabled={!customer?.whatsapp}
          >
            <Phone className="w-4 h-4 mr-1" /> WhatsApp
          </Button>
          {!order.pickedUpAt ? (
            <Button
              className="h-12 col-span-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => confirmPickup.mutate()}
              disabled={confirmPickup.isPending}
            >
              <MapPin className="w-4 h-4 mr-1" /> REALIZE A COLETA PRIMEIRO
            </Button>
          ) : order.status !== 'arrived' ? (
            <Button
              className="h-12 col-span-2 bg-primary text-primary-foreground"
              onClick={() => updateStatus.mutate('arrived')}
              disabled={updateStatus.isPending}
            >
              <Navigation className="w-4 h-4 mr-1" /> CHEGUEI
            </Button>
          ) : (
            <Button
              className="h-12 col-span-2"
              onClick={() => navigate('/motoboy')}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> VOLTAR PARA FINALIZAR
            </Button>
          )}
        </div>
        {!isTracking && permissionStatus !== 'denied' && (
          <Button variant="ghost" className="w-full mt-2 text-xs" onClick={() => startTracking()}>
            Reativar GPS
          </Button>
        )}
      </div>
    </div>
  );
}
