import { useEffect, useState } from 'react';
import { MapPin, Navigation2, Clock, Truck, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DeliveryMap } from './DeliveryMap';
import { supabase } from '@/integrations/supabase/client-safe';
import { urbanDistance, estimateDuration, formatDistance, formatDuration } from '@/lib/geo-utils';
import type { Order, Address, Motoboy } from '@/shared/schema';

interface OrderTrackingMapProps {
  order: Order;
  address?: Address;
  motoboy?: Motoboy;
  storeLocation?: { lat: number; lng: number };
}

interface MotoboyLocation {
  latitude: number;
  longitude: number;
  updatedAt: string;
}

export function OrderTrackingMap({ order, address, motoboy, storeLocation }: OrderTrackingMapProps) {
  const [motoboyLocation, setMotoboyLocation] = useState<MotoboyLocation | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<string | null>(null);
  const [distance, setDistance] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 5s for "atualizado há Xs" freshness badge
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to motoboy location updates
  useEffect(() => {
    if (!motoboy?.id || order.status !== 'dispatched') return;

    // Get initial location from motoboy record
    if ((motoboy as any).currentLatitude && (motoboy as any).currentLongitude) {
      setMotoboyLocation({
        latitude: (motoboy as any).currentLatitude,
        longitude: (motoboy as any).currentLongitude,
        updatedAt: (motoboy as any).locationUpdatedAt || new Date().toISOString(),
      });
    }

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`motoboy-location-${motoboy.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'motoboy_locations',
          filter: `motoboy_id=eq.${motoboy.id}`,
        },
        (payload) => {
          const newLocation = payload.new as any;
          setMotoboyLocation({
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
            updatedAt: newLocation.created_at,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [motoboy?.id, order.status]);

  // Calculate ETA via Haversine LOCAL (zero custo Google API)
  useEffect(() => {
    if (!motoboyLocation || !address?.latitude || !address?.longitude) return;

    const meters = urbanDistance(
      { lat: motoboyLocation.latitude, lng: motoboyLocation.longitude },
      { lat: address.latitude as number, lng: address.longitude as number }
    );
    const seconds = estimateDuration(meters);
    setDistance(formatDistance(meters));
    setEstimatedTime(formatDuration(seconds));
  }, [motoboyLocation, address]);

  const getStatusMessage = () => {
    switch (order.status) {
      case 'pending':
        return 'Aguardando confirmação do pedido...';
      case 'accepted':
        return 'Pedido confirmado! Preparando...';
      case 'preparing':
        return 'Seu pedido está sendo preparado 🍹';
      case 'ready':
        return 'Pedido pronto! Aguardando motoboy...';
      case 'dispatched':
        return 'Motoboy a caminho! 🏍️';
      case 'arrived':
        return 'Motoboy chegou! 📍';
      case 'delivered':
        return 'Pedido entregue! ✅';
      case 'cancelled':
        return 'Pedido cancelado';
      default:
        return '';
    }
  };

  const isTracking = order.status === 'dispatched' || order.status === 'arrived';

  return (
    <Card className="bg-card border-primary/20 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5 text-primary" />
            Acompanhar Entrega
          </CardTitle>
          {isTracking && estimatedTime && (
            <Badge className="bg-primary/20 text-primary border-primary/30">
              <Clock className="h-3 w-3 mr-1" />
              {estimatedTime}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{getStatusMessage()}</p>
      </CardHeader>
      
      <CardContent className="p-0">
        {/* Map */}
        <DeliveryMap
          storeLocation={storeLocation}
          deliveryLocation={address?.latitude && address?.longitude ? {
            lat: address.latitude as number,
            lng: address.longitude as number,
          } : undefined}
          motoboyLocation={motoboyLocation ? {
            lat: motoboyLocation.latitude,
            lng: motoboyLocation.longitude,
          } : undefined}
          className="h-[200px]"
        />

        {/* Info bar */}
        <div className="p-4 bg-secondary/30 border-t border-primary/10">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-400" />
              <span className="text-muted-foreground truncate max-w-[200px]">
                {address?.street}, {address?.number}
              </span>
            </div>
            
            {isTracking && distance && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Navigation2 className="h-4 w-4 text-primary" />
                <span>{distance}</span>
              </div>
            )}
          </div>

          {/* Motoboy info */}
          {motoboy && isTracking && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-primary/10">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Navigation2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-foreground">{motoboy.name}</p>
                <p className="text-xs text-muted-foreground">
                  {order.status === 'arrived' ? 'Chegou ao destino!' : 'A caminho'}
                </p>
              </div>
              {motoboyLocation && (() => {
                const ageS = Math.max(0, Math.floor((now - new Date(motoboyLocation.updatedAt).getTime()) / 1000));
                const color = ageS < 30 ? 'text-green-500' : ageS < 60 ? 'text-amber-500' : 'text-red-500';
                const label = ageS < 60 ? `${ageS}s atrás` : ageS < 3600 ? `${Math.floor(ageS/60)}min` : 'offline';
                return (
                  <div className="text-right text-xs flex-shrink-0">
                    <p className="text-muted-foreground">Atualizado</p>
                    <p className={`font-semibold ${color}`}>{label}</p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
