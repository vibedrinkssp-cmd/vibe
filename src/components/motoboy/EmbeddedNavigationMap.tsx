import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Navigation, AlertCircle, ArrowUp, CornerUpLeft, CornerUpRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';
import { haversineDistance } from '@/lib/geo-utils';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface EmbeddedNavigationMapProps {
  origin: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number };
  className?: string;
}

interface Step {
  instruction: string;
  distanceText: string;
  maneuver: string;
  endLat: number;
  endLng: number;
}

const RECALC_THRESHOLD_M = 100;

function ManeuverIcon({ maneuver, className }: { maneuver: string; className?: string }) {
  if (maneuver.includes('left')) return maneuver.includes('slight') ? <CornerUpLeft className={className} /> : <ArrowLeft className={className} />;
  if (maneuver.includes('right')) return maneuver.includes('slight') ? <CornerUpRight className={className} /> : <ArrowRight className={className} />;
  return <ArrowUp className={className} />;
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

export function EmbeddedNavigationMap({ origin, destination, className }: EmbeddedNavigationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const motoboyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [totalDistanceM, setTotalDistanceM] = useState<number | null>(null);
  const [totalDurationS, setTotalDurationS] = useState<number | null>(null);
  const lastRouteOriginRef = useRef<{ lat: number; lng: number } | null>(null);

  // Fetch API key
  useEffect(() => {
    supabase.functions.invoke('google-maps', { body: { action: 'getApiKey' } })
      .then(({ data, error }) => {
        if (error) throw error;
        if (data?.apiKey) setApiKey(data.apiKey);
        else setError('API key indisponível');
      })
      .catch((e) => {
        console.error('[EmbeddedNav] api key error', e);
        setError('Erro ao carregar mapa');
      });
  }, []);

  // Load script
  useEffect(() => {
    if (!apiKey) return;
    const id = 'google-maps-script';
    const existing = document.getElementById(id);
    if (existing) {
      if (window.google) initMap();
      else existing.addEventListener('load', () => initMap());
      return;
    }
    const s = document.createElement('script');
    s.id = id;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,geometry&v=weekly`;
    s.async = true;
    s.defer = true;
    s.onload = () => initMap();
    s.onerror = () => setError('Erro ao carregar Google Maps');
    document.head.appendChild(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google || mapInstanceRef.current) return;
    const center = origin || destination;
    mapInstanceRef.current = new google.maps.Map(mapRef.current, {
      center,
      zoom: 17,
      mapId: 'motoboy-nav-map',
      disableDefaultUI: true,
      zoomControl: false,
      gestureHandling: 'greedy',
      tilt: 0,
    });
    directionsRendererRef.current = new google.maps.DirectionsRenderer({
      map: mapInstanceRef.current,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: '#7C3AED', strokeWeight: 7, strokeOpacity: 0.85 },
    });
    setMapReady(true);
  }, [origin, destination]);

  // Compute route
  const computeRoute = useCallback((from: { lat: number; lng: number }) => {
    if (!window.google || !directionsRendererRef.current) return;
    const ds = new google.maps.DirectionsService();
    ds.route(
      { origin: from, destination, travelMode: google.maps.TravelMode.DRIVING },
      (result, status) => {
        if (status !== 'OK' || !result) return;
        directionsRendererRef.current!.setDirections(result);
        lastRouteOriginRef.current = from;
        const leg = result.routes[0]?.legs[0];
        if (!leg) return;
        setTotalDistanceM(leg.distance?.value ?? null);
        setTotalDurationS(leg.duration?.value ?? null);
        const parsed: Step[] = (leg.steps || []).map((st) => ({
          instruction: stripHtml(st.instructions || ''),
          distanceText: st.distance?.text || '',
          maneuver: (st as any).maneuver || '',
          endLat: st.end_location.lat(),
          endLng: st.end_location.lng(),
        }));
        setSteps(parsed);
        setCurrentStepIdx(0);
      }
    );
  }, [destination]);

  // First route + recalc on drift
  useEffect(() => {
    if (!mapReady || !origin) return;
    const last = lastRouteOriginRef.current;
    if (!last || haversineDistance(last, origin) > RECALC_THRESHOLD_M) {
      computeRoute(origin);
    }
  }, [mapReady, origin, computeRoute]);

  // Move motoboy marker, advance step, pan
  useEffect(() => {
    if (!mapReady || !origin || !window.google || !mapInstanceRef.current) return;

    if (!motoboyMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:48px;height:48px;background:#7C3AED;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(124,58,237,0.55);border:3px solid white;">
          <span style="font-size:24px;">🛵</span>
        </div>`;
      motoboyMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: origin,
        content: el,
        zIndex: 999,
      });
    } else {
      motoboyMarkerRef.current.position = origin;
    }
    mapInstanceRef.current.panTo(origin);

    // Advance step if close to current step end
    if (steps.length > 0 && currentStepIdx < steps.length) {
      const step = steps[currentStepIdx];
      const dist = haversineDistance(origin, { lat: step.endLat, lng: step.endLng });
      if (dist < 30 && currentStepIdx < steps.length - 1) {
        setCurrentStepIdx((i) => i + 1);
      }
    }
  }, [mapReady, origin, steps, currentStepIdx]);

  if (error) {
    return (
      <div className={cn('flex items-center justify-center bg-secondary/50 rounded-xl', className)}>
        <div className="text-center p-6">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const currentStep = steps[currentStepIdx];
  const remainingKm = totalDistanceM ? (totalDistanceM / 1000).toFixed(1) : null;
  const remainingMin = totalDurationS ? Math.max(1, Math.round(totalDurationS / 60)) : null;

  return (
    <div className={cn('relative w-full h-full', className)}>
      {/* Top turn-by-turn banner */}
      {currentStep && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-primary text-primary-foreground p-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-full bg-white/15 flex items-center justify-center">
              <ManeuverIcon maneuver={currentStep.maneuver} className="w-8 h-8" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-bold leading-tight">{currentStep.distanceText}</div>
              <div className="text-sm opacity-90 line-clamp-2">{currentStep.instruction}</div>
            </div>
          </div>
          {(remainingKm || remainingMin) && (
            <div className="mt-2 pt-2 border-t border-white/20 flex justify-between text-xs font-medium">
              <span>📍 {remainingKm} km até o destino</span>
              <span>⏱️ ~{remainingMin} min</span>
            </div>
          )}
        </div>
      )}

      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
    </div>
  );
}
