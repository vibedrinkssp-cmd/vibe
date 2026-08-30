import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface InteractiveAddressMapProps {
  latitude?: number;
  longitude?: number;
  className?: string;
  onLocationChange?: (lat: number, lng: number) => void;
}

export function InteractiveAddressMap({
  latitude,
  longitude,
  className,
  onLocationChange,
}: InteractiveAddressMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Fetch API key
  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('google-maps', {
          body: { action: 'getApiKey' }
        });
        
        if (error) throw error;
        if (data?.apiKey) {
          setApiKey(data.apiKey);
        } else {
          setError('API key não disponível');
        }
      } catch (err) {
        console.error('Erro ao buscar API key:', err);
        setError('Erro ao carregar mapa');
      }
    };

    fetchApiKey();
  }, []);

  // Load Google Maps script
  useEffect(() => {
    if (!apiKey) return;

    const scriptId = 'google-maps-script';
    
    // Check if script already exists
    if (document.getElementById(scriptId)) {
      initMap();
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

    return () => {
      // Don't remove script to allow reuse
    };
  }, [apiKey]);

  // Initialize map
  const initMap = () => {
    if (!mapRef.current || !window.google) return;

    try {
      const defaultCenter = { lat: latitude || -23.5505, lng: longitude || -46.6333 };
      
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: defaultCenter,
        zoom: latitude && longitude ? 17 : 12,
        mapId: 'address-map',
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [
          { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
          { elementType: 'labels.text.fill', stylers: [{ color: '#8b8b8b' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2d2d44' }] },
          { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e1a' }] },
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });

      // Add marker if we have coordinates
      if (latitude && longitude) {
        addMarker(latitude, longitude);
      }

      // Add click listener for marker placement
      if (onLocationChange) {
        mapInstanceRef.current.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            addMarker(lat, lng);
            onLocationChange(lat, lng);
          }
        });
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Erro ao inicializar mapa:', err);
      setError('Erro ao inicializar mapa');
    }
  };

  // Add or update marker
  const addMarker = (lat: number, lng: number) => {
    if (!mapInstanceRef.current || !window.google) return;

    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.map = null;
    }

    // Create pin element
    const pinElement = document.createElement('div');
    pinElement.innerHTML = `
      <div style="
        width: 40px;
        height: 40px;
        background: linear-gradient(135deg, hsl(280, 100%, 50%), hsl(320, 100%, 50%));
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        border: 2px solid white;
      ">
        <svg style="transform: rotate(45deg); width: 20px; height: 20px; color: white;" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `;

    markerRef.current = new google.maps.marker.AdvancedMarkerElement({
      map: mapInstanceRef.current,
      position: { lat, lng },
      content: pinElement,
      title: 'Localização selecionada',
    });

    // Center map on marker
    mapInstanceRef.current.panTo({ lat, lng });
  };

  // Update marker when coordinates change
  useEffect(() => {
    if (latitude && longitude && mapInstanceRef.current) {
      addMarker(latitude, longitude);
      mapInstanceRef.current.setZoom(17);
    }
  }, [latitude, longitude]);

  if (error) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-secondary/50 flex items-center justify-center', className)}>
        <div className="text-center p-4">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!latitude && !longitude && !isLoading && !apiKey) {
    return (
      <div className={cn('rounded-xl overflow-hidden bg-secondary/50 flex items-center justify-center', className)}>
        <div className="text-center p-4">
          <MapPin className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm text-muted-foreground">
            Busque um endereço para visualizar no mapa
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden bg-secondary/50', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full min-h-[200px]" />
      
      {/* Location indicator overlay */}
      {latitude && longitude && (
        <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-lg text-xs">
          <span className="text-muted-foreground">📍 </span>
          <span className="text-foreground font-medium">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        </div>
      )}
    </div>
  );
}
