import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Navigation2, Loader2, Store, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface DeliveryMapProps {
  storeLocation?: { lat: number; lng: number };
  deliveryLocation?: { lat: number; lng: number };
  motoboyLocation?: { lat: number; lng: number };
  className?: string;
  showRoute?: boolean;
}

export function DeliveryMap({
  storeLocation = { lat: -23.5505, lng: -46.6333 },
  deliveryLocation,
  motoboyLocation,
  className,
  showRoute = true,
}: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const storeMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const deliveryMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const motoboyMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Fetch API key from edge function
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
        console.error('[DeliveryMap] Error fetching API key:', err);
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
      if (window.google?.maps) {
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
      const center = deliveryLocation || storeLocation;

      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center,
        zoom: deliveryLocation ? 14 : 12,
        mapId: 'delivery-map',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
      });

      if (showRoute) {
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          map: mapInstanceRef.current,
          suppressMarkers: true,
          polylineOptions: {
            strokeColor: '#8B5CF6',
            strokeWeight: 4,
            strokeOpacity: 0.8,
          },
        });
      }

      setIsLoading(false);
      setMapReady(true);
    } catch (err) {
      console.error('[DeliveryMap] Init error:', err);
      setError('Erro ao inicializar mapa');
    }
  }, [storeLocation, deliveryLocation, showRoute]);

  // Create/update markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;

    // Store marker
    if (!storeMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width:32px;height:32px;background:#22c55e;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">
          <svg style="width:16px;height:16px;color:white;" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>`;
      storeMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstanceRef.current,
        position: storeLocation,
        content: el,
        title: 'Loja',
      });
    } else {
      storeMarkerRef.current.position = storeLocation;
    }

    // Delivery marker
    if (deliveryLocation) {
      if (!deliveryMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="width:32px;height:32px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white;">
            <svg style="width:16px;height:16px;color:white;" fill="currentColor" viewBox="0 0 24 24">
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
    }

    // Motoboy marker
    if (motoboyLocation) {
      if (!motoboyMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="width:40px;height:40px;background:#8B5CF6;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(139,92,246,0.5);border:3px solid white;">
            <span style="font-size:20px;">🛵</span>
          </div>`;
        motoboyMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
          map: mapInstanceRef.current,
          position: motoboyLocation,
          content: el,
          title: 'Motoboy',
          zIndex: 100,
        });
      } else {
        motoboyMarkerRef.current.position = motoboyLocation;
      }
    }

    // Fit bounds to show all markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(storeLocation);
    if (deliveryLocation) bounds.extend(deliveryLocation);
    if (motoboyLocation) bounds.extend(motoboyLocation);
    mapInstanceRef.current.fitBounds(bounds, { top: 30, right: 30, bottom: 30, left: 30 });

    // Draw route
    if (showRoute && deliveryLocation && directionsRendererRef.current) {
      const origin = motoboyLocation || storeLocation;
      const ds = new google.maps.DirectionsService();
      ds.route(
        {
          origin,
          destination: deliveryLocation,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === 'OK' && result && directionsRendererRef.current) {
            directionsRendererRef.current.setDirections(result);
          }
        }
      );
    }
  }, [mapReady, storeLocation, deliveryLocation, motoboyLocation, showRoute]);

  // Fallback visual when error
  if (error) {
    return (
      <div className={cn('relative rounded-xl overflow-hidden bg-secondary/50', className)}>
        <div className="relative h-full min-h-[150px] bg-gradient-to-br from-secondary via-secondary/80 to-secondary/60 flex items-center justify-center">
          <div className="text-center p-4">
            <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-secondary/50', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full min-h-[150px]" />
    </div>
  );
}
