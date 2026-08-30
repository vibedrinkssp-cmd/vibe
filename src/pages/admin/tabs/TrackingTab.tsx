// Real-time Motoboy Tracking Tab
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  MapPin, Navigation2, Phone, Package, Clock, Wifi, WifiOff, 
  RefreshCw, Bike, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client-safe';
import { MotoboyTrackingMap } from '@/components/location/MotoboyTrackingMap';
import { formatCurrency, formatDate, ORDER_STATUS_LABELS, type Motoboy, type Order, type OrderStatus } from '../shared';

interface ActiveOrderInfo {
  id: string;
  status: string;
}

interface MotoboyWithLocation extends Motoboy {
  currentLatitude?: number | null;
  currentLongitude?: number | null;
  locationUpdatedAt?: string | null;
  activeOrders?: ActiveOrderInfo[];
  distanceToStore?: number;
  eta?: string;
}

interface StoreLocation {
  lat: number;
  lng: number;
  address: string;
}

export function TrackingTab() {
  const { toast } = useToast();
  const [selectedMotoboy, setSelectedMotoboy] = useState<string | null>(null);
  const [motoboyDistances, setMotoboyDistances] = useState<Record<string, { distance: number; duration: number }>>({});

  // Fetch store settings
  const { data: settings } = useQuery({
    queryKey: ['settings-tracking'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const storeLocation: StoreLocation | null = settings?.store_lat && settings?.store_lng 
    ? { lat: settings.store_lat, lng: settings.store_lng, address: settings.store_address || 'Loja' }
    : null;

  // Fetch motoboys with real-time subscription - using RPC to bypass RLS
  const { data: motoboys = [], isLoading: isLoadingMotoboys, refetch: refetchMotoboys } = useQuery({
    queryKey: ['motoboys-tracking'],
    queryFn: async () => {
      // Use RPC to bypass RLS since we use custom auth
      const { data, error } = await supabase.rpc('get_all_motoboys');
      if (error) throw error;
      console.log('[TrackingTab] Loaded motoboys:', data?.length, data?.filter((m: any) => m.current_latitude).length, 'with location');
      return (data || []).filter((m: any) => m.is_active).map((m: any) => ({
        id: m.id,
        name: m.name,
        whatsapp: m.whatsapp,
        isActive: m.is_active ?? true,
        photoUrl: m.photo_url,
        currentLatitude: m.current_latitude,
        currentLongitude: m.current_longitude,
        locationUpdatedAt: m.location_updated_at,
      })) as MotoboyWithLocation[];
    },
    refetchInterval: 30000,
  });

  // Fetch active orders for motoboys
  const { data: activeOrders = [] } = useQuery({
    queryKey: ['active-orders-tracking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, motoboy_id')
        .in('status', ['dispatched', 'arrived'])
        .not('motoboy_id', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as { id: string; status: string; motoboy_id: string }[];
    },
    refetchInterval: 30000,
  });

  // Subscribe to real-time location updates
  useEffect(() => {
    const channel = supabase
      .channel('motoboy-locations-tracking')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motoboys',
        },
        (payload) => {
          console.log('[Tracking] Motoboy location update:', payload);
          refetchMotoboys();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetchMotoboys]);

  // Calculate distances to store — run only when motoboy list actually changes
  // Serialize motoboy IDs + coords to avoid re-running on object identity changes
  const motoboyLocationKey = motoboys
    .filter(m => m.currentLatitude && m.currentLongitude)
    .map(m => `${m.id}:${m.currentLatitude?.toFixed(4)},${m.currentLongitude?.toFixed(4)}`)
    .join('|');

  useEffect(() => {
    if (!storeLocation || !motoboyLocationKey) return;

    let cancelled = false;

    const calculateDistances = async () => {
      const newDistances: Record<string, { distance: number; duration: number }> = {};
      const storeLoc = `${storeLocation.lat},${storeLocation.lng}`;

      for (const motoboy of motoboys) {
        if (cancelled) break;
        if (!motoboy.currentLatitude || !motoboy.currentLongitude) continue;

        try {
          const originStr = `${motoboy.currentLatitude},${motoboy.currentLongitude}`;
          const { data, error } = await supabase.functions.invoke('google-maps', {
            body: { action: 'distanceMatrix', origin: originStr, destination: storeLoc },
          });
          if (error) continue;
          const element = data?.rows?.[0]?.elements?.[0];
          if (element?.status === 'OK') {
            newDistances[motoboy.id] = {
              distance: element.distance.value,
              duration: element.duration.value,
            };
          }
        } catch {
          // skip
        }
      }

      if (!cancelled) setMotoboyDistances(newDistances);
    };

    calculateDistances();
    return () => { cancelled = true; };
  }, [motoboyLocationKey, storeLocation?.lat, storeLocation?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combine motoboys with their active orders
  const motoboysWithOrders: MotoboyWithLocation[] = motoboys.map(motoboy => ({
    ...motoboy,
    activeOrders: activeOrders.filter(o => o.motoboy_id === motoboy.id),
    distanceToStore: motoboyDistances[motoboy.id]?.distance,
    eta: motoboyDistances[motoboy.id]?.duration 
      ? `${Math.ceil(motoboyDistances[motoboy.id].duration / 60)} min`
      : undefined,
  }));

  const formatDistance = (meters: number | undefined) => {
    if (!meters) return '-';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getLocationAge = (updatedAt: string | null | undefined) => {
    if (!updatedAt) return null;
    const diff = Date.now() - new Date(updatedAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Agora';
    if (minutes < 60) return `${minutes}min atrás`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h atrás`;
  };

  const isLocationRecent = (updatedAt: string | null | undefined) => {
    if (!updatedAt) return false;
    const diff = Date.now() - new Date(updatedAt).getTime();
    return diff < 5 * 60 * 1000; // Less than 5 minutes
  };

  const selectedMotoboyData = motoboysWithOrders.find(m => m.id === selectedMotoboy);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl text-primary">Tracking em Tempo Real</h2>
          <p className="text-muted-foreground">Acompanhe a localização dos motoboys</p>
        </div>
        <Button variant="outline" onClick={() => refetchMotoboys()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {/* Store Location Card */}
      {storeLocation && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-primary">Localização da Loja</p>
              <p className="text-sm text-muted-foreground">{storeLocation.address}</p>
            </div>
            <Badge variant="outline" className="border-primary/30 text-primary">
              {storeLocation.lat.toFixed(4)}, {storeLocation.lng.toFixed(4)}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Real Google Maps */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Navigation2 className="w-5 h-5" />
            Mapa de Localização em Tempo Real
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <MotoboyTrackingMap
            storeLocation={storeLocation || undefined}
            motoboys={motoboysWithOrders
              .filter(m => m.currentLatitude && m.currentLongitude)
              .map(m => ({
                id: m.id,
                name: m.name,
                latitude: m.currentLatitude!,
                longitude: m.currentLongitude!,
                updatedAt: m.locationUpdatedAt || new Date().toISOString(),
                activeOrdersCount: m.activeOrders?.length || 0,
              }))}
            selectedMotoboyId={selectedMotoboy}
            onMotoboySelect={setSelectedMotoboy}
            className="h-[450px]"
          />
        </CardContent>
      </Card>

      {/* Selected motoboy detail panel */}
      {selectedMotoboyData && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isLocationRecent(selectedMotoboyData.locationUpdatedAt) ? 'bg-green-500' : 'bg-primary'
                }`}>
                  <Bike className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span>{selectedMotoboyData.name}</span>
                  <p className="text-sm font-normal text-muted-foreground">{selectedMotoboyData.whatsapp}</p>
                </div>
              </CardTitle>
              <Badge className={isLocationRecent(selectedMotoboyData.locationUpdatedAt) 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-primary/20 text-primary'
              }>
                {isLocationRecent(selectedMotoboyData.locationUpdatedAt) ? (
                  <><Wifi className="w-3 h-3 mr-1" /> Online</>
                ) : (
                  <><WifiOff className="w-3 h-3 mr-1" /> Offline</>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-secondary/50 rounded-lg">
                <Clock className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{getLocationAge(selectedMotoboyData.locationUpdatedAt) || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">Última atualização</p>
              </div>
              <div className="text-center p-3 bg-secondary/50 rounded-lg">
                <Navigation2 className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{formatDistance(selectedMotoboyData.distanceToStore)}</p>
                <p className="text-xs text-muted-foreground">Distância da loja</p>
              </div>
              <div className="text-center p-3 bg-secondary/50 rounded-lg">
                <MapPin className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{selectedMotoboyData.eta || 'N/A'}</p>
                <p className="text-xs text-muted-foreground">ETA à loja</p>
              </div>
              <div className="text-center p-3 bg-secondary/50 rounded-lg">
                <Package className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm font-medium">{selectedMotoboyData.activeOrders?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Entregas ativas</p>
              </div>
            </div>

            {/* Active orders for selected motoboy */}
            {selectedMotoboyData.activeOrders && selectedMotoboyData.activeOrders.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium mb-3">Entregas em andamento:</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {selectedMotoboyData.activeOrders.map(order => (
                    <div key={order.id} className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
                      <span className="font-mono text-sm">#{order.id.slice(-6)}</span>
                      <Badge className={order.status === 'dispatched' 
                        ? 'bg-purple-500/20 text-purple-400' 
                        : 'bg-blue-500/20 text-blue-400'
                      }>
                        {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Motoboys List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingMotoboys ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))
        ) : motoboysWithOrders.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="p-12 text-center">
              <Bike className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum motoboy ativo</p>
              <p className="text-sm text-muted-foreground">Cadastre motoboys na aba "Motoboys"</p>
            </CardContent>
          </Card>
        ) : (
          motoboysWithOrders.map(motoboy => {
            const isRecent = isLocationRecent(motoboy.locationUpdatedAt);
            const hasLocation = motoboy.currentLatitude && motoboy.currentLongitude;
            
            return (
              <Card 
                key={motoboy.id} 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedMotoboy === motoboy.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedMotoboy(motoboy.id === selectedMotoboy ? null : motoboy.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      hasLocation && isRecent 
                        ? 'bg-green-500' 
                        : hasLocation 
                          ? 'bg-primary' 
                          : 'bg-muted'
                    }`}>
                      <Bike className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{motoboy.name}</h3>
                        {hasLocation && (
                          <Badge className={isRecent 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-primary/20 text-primary'
                          }>
                            {isRecent ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
                            {isRecent ? 'Online' : 'Offline'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {motoboy.whatsapp}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    {hasLocation ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Última atualização
                          </span>
                          <span>{getLocationAge(motoboy.locationUpdatedAt)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Navigation2 className="w-3 h-3" />
                            Distância da loja
                          </span>
                          <span>{formatDistance(motoboy.distanceToStore)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            Entregas ativas
                          </span>
                          <Badge variant="secondary">{motoboy.activeOrders?.length || 0}</Badge>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-2">
                        <AlertCircle className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                        <p className="text-sm text-muted-foreground">
                          Localização não disponível
                        </p>
                        <p className="text-xs text-muted-foreground">
                          O motoboy precisa ativar o GPS no app
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Active orders for this motoboy */}
                  {motoboy.activeOrders && motoboy.activeOrders.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Entregas em andamento:</p>
                      <div className="space-y-1">
                        {motoboy.activeOrders.slice(0, 2).map(order => (
                          <div key={order.id} className="flex items-center justify-between text-xs bg-secondary/50 rounded p-2">
                            <span className="font-mono">#{order.id.slice(-6)}</span>
                            <Badge className={order.status === 'dispatched' 
                              ? 'bg-purple-500/20 text-purple-400' 
                              : 'bg-blue-500/20 text-blue-400'
                            }>
                              {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                            </Badge>
                          </div>
                        ))}
                        {motoboy.activeOrders.length > 2 && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{motoboy.activeOrders.length - 2} mais
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
