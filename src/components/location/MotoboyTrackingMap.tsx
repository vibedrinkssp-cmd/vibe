import { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Loader2, Navigation2, Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface MotoboyLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  activeOrdersCount: number;
}

interface MotoboyTrackingMapProps {
  storeLocation?: { lat: number; lng: number };
  motoboys: MotoboyLocation[];
  selectedMotoboyId?: string | null;
  onMotoboySelect?: (id: string | null) => void;
  className?: string;
}

export function MotoboyTrackingMap({
  storeLocation,
  motoboys,
  selectedMotoboyId,
  onMotoboySelect,
  className,
}: MotoboyTrackingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const storeMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const motoboyMarkersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const hasFitBoundsRef = useRef(false);
  const userInteractedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Fetch API key with retry
  useEffect(() => {
    let cancelled = false;
    const fetchApiKey = async (attempt = 0) => {
      try {
        const { data, error } = await supabase.functions.invoke('google-maps', {
          body: { action: 'getApiKey' }
        });
        
        if (cancelled) return;
        if (error) throw error;
        if (data?.apiKey) {
          setApiKey(data.apiKey);
          setError(null);
        } else {
          throw new Error('API key não disponível');
        }
      } catch (err) {
        if (cancelled) return;
        console.error(`[MotoboyTrackingMap] Erro ao buscar API key (tentativa ${attempt + 1}):`, err);
        if (attempt < 3) {
          setTimeout(() => fetchApiKey(attempt + 1), 2000 * (attempt + 1));
        } else {
          setError('Erro ao carregar mapa. Verifique a conexão.');
          setIsLoading(false);
        }
      }
    };

    if (!apiKey) fetchApiKey();
    return () => { cancelled = true; };
  }, [apiKey]);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey) return;

    const loadScript = () => {
      const scriptId = 'google-maps-script';
      
      // Check if script already exists
      const existingScript = document.getElementById(scriptId);
      if (existingScript) {
        // If google is already loaded, init the map
        if (window.google) {
          initMap();
        } else {
          // Wait for script to load
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
    };

    loadScript();
  }, [apiKey]);

  // Initialize map
  const initMap = useCallback(() => {
    if (!mapRef.current || !window.google) return;

    try {
      const defaultCenter = storeLocation || { lat: -23.5505, lng: -46.6333 };
      
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: 14,
        mapId: 'motoboy-tracking-map',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });

      // Track user interaction (drag/zoom) — once user moves the map, stop auto-fitting
      const markInteracted = () => { userInteractedRef.current = true; };
      mapInstanceRef.current.addListener('dragstart', markInteracted);
      mapInstanceRef.current.addListener('zoom_changed', () => {
        // ignore programmatic zoom changes happening before first user gesture
        if (hasFitBoundsRef.current) userInteractedRef.current = true;
      });

      setIsLoading(false);
      setMapReady(true);
    } catch (err) {
      console.error('Erro ao inicializar mapa:', err);
      setError('Erro ao inicializar mapa');
    }
  }, [storeLocation]);

  // Add/update store marker
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google || !storeLocation) return;

    // Remove existing store marker
    if (storeMarkerRef.current) {
      storeMarkerRef.current.map = null;
    }

    // Create store marker element
    const storeElement = document.createElement('div');
    storeElement.innerHTML = `
      <div style="
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        border: 3px solid white;
        animation: pulse 2s ease-in-out infinite;
      ">
        <svg style="width: 24px; height: 24px; color: white;" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `;

    storeMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map: mapInstanceRef.current,
      position: storeLocation,
      content: storeElement,
      title: 'Loja',
      zIndex: 100,
    });
  }, [mapReady, storeLocation]);

  // Add/update motoboy markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.google) return;

    // Keep track of which markers should exist
    const currentMotoboyIds = new Set(motoboys.map(m => m.id));

    // Remove markers for motoboys no longer in the list
    motoboyMarkersRef.current.forEach((marker, id) => {
      if (!currentMotoboyIds.has(id)) {
        marker.map = null;
        motoboyMarkersRef.current.delete(id);
      }
    });

    // Add or update markers for each motoboy
    motoboys.forEach(motoboy => {
      const existingMarker = motoboyMarkersRef.current.get(motoboy.id);
      const isRecent = Date.now() - new Date(motoboy.updatedAt).getTime() < 5 * 60 * 1000;
      const isSelected = motoboy.id === selectedMotoboyId;

      // Create marker element
      const createMarkerElement = () => {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="
            position: relative;
            cursor: pointer;
            transform: ${isSelected ? 'scale(1.3)' : 'scale(1)'};
            transition: transform 0.2s ease;
          ">
            <div style="
              width: 40px;
              height: 40px;
              background: ${isRecent ? '#22c55e' : '#eab308'};
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 4px 12px rgba(0,0,0,0.4);
              border: ${isSelected ? '3px solid hsl(var(--primary))' : '2px solid white'};
            ">
              <svg style="width: 20px; height: 20px; color: white;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            ${motoboy.activeOrdersCount > 0 ? `
              <div style="
                position: absolute;
                top: -4px;
                right: -4px;
                width: 20px;
                height: 20px;
                background: hsl(var(--primary));
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: bold;
                color: white;
              ">${motoboy.activeOrdersCount}</div>
            ` : ''}
            <div style="
              position: absolute;
              bottom: -22px;
              left: 50%;
              transform: translateX(-50%);
              white-space: nowrap;
              background: rgba(0,0,0,0.8);
              color: white;
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 10px;
              font-weight: 500;
            ">${motoboy.name.split(' ')[0]}</div>
          </div>
        `;
        return el;
      };

      if (existingMarker) {
        // Update position
        existingMarker.position = { lat: motoboy.latitude, lng: motoboy.longitude };
        existingMarker.content = createMarkerElement();
      } else {
        // Create new marker
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapInstanceRef.current,
          position: { lat: motoboy.latitude, lng: motoboy.longitude },
          content: createMarkerElement(),
          title: motoboy.name,
          zIndex: isSelected ? 50 : 10,
        });

        // Add click listener
        marker.addListener('click', () => {
          onMotoboySelect?.(motoboy.id === selectedMotoboyId ? null : motoboy.id);
        });

        motoboyMarkersRef.current.set(motoboy.id, marker);
      }
    });

    // Fit bounds only on first load with markers, and never after the user has moved the map
    if (
      motoboys.length > 0 &&
      mapInstanceRef.current &&
      !hasFitBoundsRef.current &&
      !userInteractedRef.current &&
      !selectedMotoboyId
    ) {
      const bounds = new google.maps.LatLngBounds();

      if (storeLocation) {
        bounds.extend(storeLocation);
      }

      motoboys.forEach(m => {
        bounds.extend({ lat: m.latitude, lng: m.longitude });
      });

      mapInstanceRef.current.fitBounds(bounds, 60);
      hasFitBoundsRef.current = true;
    }
  }, [mapReady, motoboys, selectedMotoboyId, storeLocation, onMotoboySelect]);

  // Center on selected motoboy
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !selectedMotoboyId) return;

    const selectedMotoboy = motoboys.find(m => m.id === selectedMotoboyId);
    if (selectedMotoboy) {
      mapInstanceRef.current.panTo({ lat: selectedMotoboy.latitude, lng: selectedMotoboy.longitude });
      mapInstanceRef.current.setZoom(16);
    }
  }, [mapReady, selectedMotoboyId, motoboys]);

  if (error) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-secondary/50 flex items-center justify-center', className)}>
        <div className="text-center p-8">
          <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <button
            onClick={() => { setError(null); setApiKey(null); setIsLoading(true); }}
            className="text-xs text-primary underline hover:text-primary/80"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-secondary/50', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <div className="text-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Carregando mapa...</p>
          </div>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full min-h-[400px]" />
      
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-background/95 backdrop-blur-sm rounded-lg p-3 text-xs space-y-2 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500"></div>
          <span>Online (últimos 5min)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
          <span>Localização antiga</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary"></div>
          <span>Loja</span>
        </div>
      </div>

      {/* Motoboy count */}
      <div className="absolute top-3 left-3 bg-background/95 backdrop-blur-sm rounded-lg px-3 py-2 text-sm shadow-lg flex items-center gap-2">
        <Bike className="w-4 h-4 text-primary" />
        <span className="font-medium">{motoboys.length}</span>
        <span className="text-muted-foreground">motoboy{motoboys.length !== 1 ? 's' : ''} no mapa</span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
