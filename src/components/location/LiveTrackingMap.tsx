import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, MapPin, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';
import { haversineDistance } from '@/lib/geo-utils';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface LiveTrackingMapProps {
  storeLocation: { lat: number; lng: number };
  deliveryLocation: { lat: number; lng: number };
  motoboyLocation?: { lat: number; lng: number };
  orderId?: string; // Para cache persistente da rota no banco
  height?: string;
  className?: string;
}

// Limiar de desvio para forçar recálculo de rota (metros)
const ROUTE_RECALC_THRESHOLD_M = 500;

export function LiveTrackingMap({
  storeLocation,
  deliveryLocation,
  motoboyLocation,
  orderId,
  height = '250px',
  className,
}: LiveTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const motoboyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const storeMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const deliveryMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  // Origem da última rota desenhada — só recalcula se desviar muito
  const routeOriginRef = useRef<{ lat: number; lng: number } | null>(null);
  const routeFetchedRef = useRef(false);

  // Fetch API key
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-maps', {
          body: { action: 'getApiKey' },
        });
        if (error) throw error;
        if (data?.apiKey) {
          setApiKey(data.apiKey);
        } else {
          setError('API key não disponível');
        }
      } catch (err) {
        console.error('[LiveTrackingMap] Error fetching API key:', err);
        setError('Erro ao carregar mapa');
      }
    };
    fetchApiKey();
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey) return;

    const scriptId = 'google-maps-script';
    const existingScript = document.getElementById(scriptId);

    if (existingScript) {
      if (window.google) {
        initMap();
      } else {
        existingScript.addEventListener('load', () => initMap());
      }
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,geometry&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => initMap();
    script.onerror = () => setError('Erro ao carregar Google Maps');
    document.head.appendChild(script);
  }, [apiKey]);

  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    try {
      const center = motoboyLocation || storeLocation;

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: 15,
        mapId: 'live-tracking-map',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });

      // DirectionsRenderer for road route
      directionsRendererRef.current = new google.maps.DirectionsRenderer({
        map: mapInstanceRef.current,
        suppressMarkers: true, // We use custom markers
        polylineOptions: {
          strokeColor: '#8B5CF6',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        },
      });

      setIsLoading(false);
      setMapReady(true);
    } catch (err) {
      console.error('[LiveTrackingMap] Init error:', err);
      setError('Erro ao inicializar mapa');
    }
  }, [storeLocation, motoboyLocation]);

  // Create/update markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;

    // Store marker
    if (!storeMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:36px;height:36px;background:#22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">
          <svg style="width:18px;height:18px;color:white;" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>`;
      storeMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: storeLocation,
        content: el,
        title: 'Loja',
      });
    }

    // Delivery marker
    if (!deliveryMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:36px;height:36px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">
          <svg style="width:18px;height:18px;color:white;" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        </div>`;
      deliveryMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: deliveryLocation,
        content: el,
        title: 'Entrega',
      });
    } else {
      deliveryMarkerRef.current.position = deliveryLocation;
    }
  }, [mapReady, storeLocation, deliveryLocation]);

  // Smooth animate marker to new position
  const animateMarkerTo = useCallback((marker: google.maps.marker.AdvancedMarkerElement, target: { lat: number; lng: number }) => {
    const currentPos = marker.position as google.maps.LatLng | google.maps.LatLngLiteral | null;
    if (!currentPos) {
      marker.position = target;
      return;
    }
    
    const startLat = typeof currentPos === 'object' && 'lat' in currentPos
      ? (typeof currentPos.lat === 'function' ? currentPos.lat() : currentPos.lat)
      : 0;
    const startLng = typeof currentPos === 'object' && 'lng' in currentPos
      ? (typeof currentPos.lng === 'function' ? currentPos.lng() : currentPos.lng)
      : 0;

    const duration = 1000; // 1 second animation
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      
      marker.position = {
        lat: startLat + (target.lat - startLat) * ease,
        lng: startLng + (target.lng - startLng) * ease,
      };

      if (t < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }, []);

  // Helper: desenha rota usando Directions API e salva no banco (cache persistente)
  const fetchAndDrawRoute = useCallback(
    async (origin: { lat: number; lng: number }) => {
      if (!directionsRendererRef.current || !window.google) return;

      // 1) Tenta carregar rota cacheada do banco (se houver orderId)
      if (orderId && !routeFetchedRef.current) {
        routeFetchedRef.current = true;
        try {
          const { data } = await supabase
            .from('orders')
            .select('route_polyline, route_origin_lat, route_origin_lng')
            .eq('id', orderId)
            .maybeSingle();

          if (data?.route_polyline && data.route_origin_lat && data.route_origin_lng) {
            const cachedOrigin = {
              lat: Number(data.route_origin_lat),
              lng: Number(data.route_origin_lng),
            };
            // Se a origem cacheada está perto da atual, reusa a rota (custo zero)
            const drift = haversineDistance(cachedOrigin, origin);
            if (drift < ROUTE_RECALC_THRESHOLD_M) {
              const path = window.google.maps.geometry?.encoding?.decodePath(data.route_polyline);
              if (path && path.length > 0) {
                directionsRendererRef.current.setDirections({
                  routes: [
                    {
                      overview_path: path,
                      overview_polyline: data.route_polyline,
                      legs: [{ start_location: path[0], end_location: path[path.length - 1] }],
                      bounds: new window.google.maps.LatLngBounds(),
                      copyrights: '',
                      warnings: [],
                      waypoint_order: [],
                    } as any,
                  ],
                  request: {} as any,
                  geocoded_waypoints: [],
                } as any);
                routeOriginRef.current = cachedOrigin;
                return;
              }
            }
          }
        } catch (e) {
          console.warn('[LiveTrackingMap] cache read failed', e);
        }
      }

      // 2) Chama Directions API (custa 1 chamada)
      const ds = new google.maps.DirectionsService();
      ds.route(
        {
          origin,
          destination: deliveryLocation,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        async (result, status) => {
          if (status === 'OK' && result && directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result);
            routeOriginRef.current = origin;

            // Salva no banco para reuso (zera custo nas próximas atualizações)
            if (orderId) {
              const polyline = result.routes[0]?.overview_polyline;
              const leg = result.routes[0]?.legs[0];
              try {
                await supabase
                  .from('orders')
                  .update({
                    route_polyline: polyline,
                    route_origin_lat: origin.lat,
                    route_origin_lng: origin.lng,
                    route_distance_meters: leg?.distance?.value ?? null,
                    route_duration_seconds: leg?.duration?.value ?? null,
                    route_calculated_at: new Date().toISOString(),
                  })
                  .eq('id', orderId);
              } catch (e) {
                console.warn('[LiveTrackingMap] cache write failed', e);
              }
            }
          }
        }
      );
    },
    [deliveryLocation, orderId]
  );

  // Update motoboy marker + route (recalcula rota só se desvio > 500m)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;

    if (!motoboyLocation) {
      // Sem motoboy ainda — desenha rota loja→entrega 1x
      if (!routeOriginRef.current) {
        fetchAndDrawRoute(storeLocation);
      }
      return;
    }

    // Update/create motoboy marker
    if (!motoboyMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;">
          <div style="width:44px;height:44px;background:#8B5CF6;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(139,92,246,0.5);border:3px solid white;animation:pulse 2s ease-in-out infinite;">
            <span style="font-size:22px;">🛵</span>
          </div>
          <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);white-space:nowrap;background:rgba(0,0,0,0.8);color:white;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;">Motoboy</div>
        </div>`;
      motoboyMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: motoboyLocation,
        content: el,
        title: 'Motoboy',
        zIndex: 100,
      });
    } else {
      animateMarkerTo(motoboyMarkerRef.current, motoboyLocation);
    }

    // Recalcula rota APENAS se desviou > 500m da última origem (zero custo enquanto na rota)
    const lastOrigin = routeOriginRef.current;
    const shouldRefetch =
      !lastOrigin ||
      haversineDistance(lastOrigin, motoboyLocation) > ROUTE_RECALC_THRESHOLD_M;

    if (shouldRefetch) {
      fetchAndDrawRoute(motoboyLocation);
    }

    mapInstanceRef.current.panTo(motoboyLocation);
  }, [mapReady, motoboyLocation, storeLocation, deliveryLocation, animateMarkerTo, fetchAndDrawRoute]);


  if (error) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-secondary/50 flex items-center justify-center', className)} style={{ height }}>
        <div className="text-center p-6">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden', className)} style={{ height }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
}
