import { useState, useEffect } from 'react';
import { Clock, Route, Loader2, Truck, Bike } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeliveryEstimateProps {
  storeLocation: { lat: number; lng: number };
  deliveryLocation: { lat: number; lng: number };
  className?: string;
  onEstimateChange?: (estimate: { distance: number; duration: number } | null) => void;
  /** Live mode: motoboy en route. Shows countdown + live updates */
  isLiveTracking?: boolean;
  /** Last GPS update timestamp from motoboy */
  lastUpdateAt?: string;
}

export function DeliveryEstimate({
  storeLocation,
  deliveryLocation,
  className,
  onEstimateChange,
  isLiveTracking = false,
  lastUpdateAt,
}: DeliveryEstimateProps) {
  const [estimate, setEstimate] = useState<{ distance: number; duration: number } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick every second when live tracking for "atualizado há Xs" + countdown smoothness
  useEffect(() => {
    if (!isLiveTracking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLiveTracking]);

  // Haversine fallback when Google Maps API fails
  const getHaversineFallback = () => {
    const R = 6371000; // Earth radius in meters
    const dLat = (deliveryLocation.lat - storeLocation.lat) * Math.PI / 180;
    const dLng = (deliveryLocation.lng - storeLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(storeLocation.lat * Math.PI / 180) * Math.cos(deliveryLocation.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    // Haversine = linha reta. Multiplica por 1.3 (fator de tortuosidade urbana) p/ aproximar rota real
    const straightDistance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = straightDistance * 1.3;
    // Estimate duration: ~30km/h average speed in urban areas
    const duration = (distance / 1000) * 120; // seconds (30km/h = 120s/km)
    return { distance, duration };
  };

  useEffect(() => {
    if (!deliveryLocation.lat || !deliveryLocation.lng) return;

    // ECONOMIA: usa Haversine local (gratuito) para estimativa em tela.
    // Distance Matrix real só é necessário se quiser tempo de trânsito exato — não justifica custo aqui.
    setIsCalculating(true);
    const result = getHaversineFallback();
    setEstimate(result);
    onEstimateChange?.(result);
    setIsCalculating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLocation.lat, storeLocation.lng, deliveryLocation.lat, deliveryLocation.lng]);

  const formatDistance = (meters: number) => {
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(1)} km`;
    }
    return `${meters} m`;
  };

  const formatDuration = (seconds: number) => {
    // Add 5-10 minutes for preparation
    const totalSeconds = seconds + 300; // 5 min prep
    const minutes = Math.round(totalSeconds / 60);
    
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}min`;
    }
    
    return `${minutes} min`;
  };

  const getEstimatedRange = (seconds: number) => {
    const baseMinutes = Math.round((seconds + 300) / 60); // 5 min prep
    const minTime = baseMinutes;
    const maxTime = baseMinutes + 15;
    
    return `${minTime}-${maxTime} min`;
  };

  if (isCalculating) {
    return (
      <div className={cn('flex items-center gap-2 p-3 bg-secondary/50 rounded-lg', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Calculando tempo de entrega...</span>
      </div>
    );
  }

  if (!estimate) {
    return null;
  }

  // ===== LIVE TRACKING MODE: motoboy en route =====
  if (isLiveTracking) {
    // No prep time when motoboy is already en route
    const liveSeconds = estimate.duration;
    const liveMinutes = Math.max(1, Math.round(liveSeconds / 60));
    const ageS = lastUpdateAt
      ? Math.max(0, Math.floor((now - new Date(lastUpdateAt).getTime()) / 1000))
      : null;
    const freshnessColor =
      ageS == null ? 'text-muted-foreground' : ageS < 30 ? 'text-green-500' : ageS < 90 ? 'text-amber-500' : 'text-red-500';
    const freshnessLabel =
      ageS == null ? '' : ageS < 60 ? `${ageS}s` : ageS < 3600 ? `${Math.floor(ageS / 60)}min` : 'offline';

    return (
      <div className={cn('bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/30 rounded-xl p-4 shadow-[0_0_24px_hsl(var(--primary)/0.25)]', className)}>
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center">
            <Bike className="h-6 w-6 text-primary" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Motoboy a caminho
            </p>
            <p className="text-2xl font-bold text-primary leading-tight">
              ~{liveMinutes} min
            </p>
          </div>
          {ageS != null && (
            <div className="text-right text-[10px] flex-shrink-0">
              <p className="text-muted-foreground">GPS</p>
              <p className={cn('font-bold', freshnessColor)}>{freshnessLabel}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
            <Clock className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Chegada</p>
              <p className="text-sm font-bold text-foreground">{liveMinutes} min</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
            <Route className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Distância</p>
              <p className="text-sm font-bold text-foreground">{formatDistance(estimate.distance)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== STATIC ESTIMATE MODE =====
  return (
    <div className={cn('bg-gradient-to-r from-primary/10 to-secondary/50 border border-primary/20 rounded-xl p-4', className)}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
          <Truck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Estimativa de entrega</p>
          <p className="text-lg font-bold text-primary">{getEstimatedRange(estimate.duration)}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
          <Clock className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Tempo estimado</p>
            <p className="text-sm font-medium text-foreground">{formatDuration(estimate.duration)}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-background/50 rounded-lg">
          <Route className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Distância</p>
            <p className="text-sm font-medium text-foreground">{formatDistance(estimate.distance)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
