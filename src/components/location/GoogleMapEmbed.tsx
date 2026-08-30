import { useState, useEffect, useMemo } from 'react';
import { Loader2, MapPin, Navigation2, Store, Home, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client-safe';

interface GoogleMapEmbedProps {
  storeLocation: { lat: number; lng: number };
  deliveryLocation?: { lat: number; lng: number };
  motoboyLocation?: { lat: number; lng: number };
  className?: string;
  showRoute?: boolean;
  zoom?: number;
  height?: string;
}

export function GoogleMapEmbed({
  storeLocation,
  deliveryLocation,
  motoboyLocation,
  className,
  showRoute = true,
  zoom = 14,
  height = '300px',
}: GoogleMapEmbedProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);

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
        }
      } catch (err) {
        console.error('[GoogleMapEmbed] Error fetching API key:', err);
        setHasError(true);
      }
    };
    fetchApiKey();
  }, []);

  // Build the embed URL
  const mapUrl = useMemo(() => {
    if (!apiKey) return null;

    const baseUrl = 'https://www.google.com/maps/embed/v1';

    if (showRoute && deliveryLocation) {
      const origin = motoboyLocation
        ? `${motoboyLocation.lat},${motoboyLocation.lng}`
        : `${storeLocation.lat},${storeLocation.lng}`;
      const destination = `${deliveryLocation.lat},${deliveryLocation.lng}`;
      return `${baseUrl}/directions?key=${apiKey}&origin=${origin}&destination=${destination}&mode=driving`;
    }

    const center = deliveryLocation || storeLocation;
    return `${baseUrl}/place?key=${apiKey}&q=${center.lat},${center.lng}&zoom=${zoom}`;
  }, [apiKey, storeLocation, deliveryLocation, motoboyLocation, showRoute, zoom]);

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
  }, [mapUrl]);

  const handleLoad = () => setIsLoading(false);
  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  // Fallback visual map when no API key or error
  if (!mapUrl || hasError) {
    return (
      <div className={cn('relative rounded-xl overflow-hidden bg-secondary/50', className)} style={{ height }}>
        <div className="relative h-full bg-gradient-to-br from-secondary via-secondary/80 to-secondary/60">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'linear-gradient(to right, hsl(var(--primary)/0.3) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--primary)/0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />

          {hasError && (
            <div className="absolute top-2 left-2 right-2 bg-yellow/10 border border-yellow/30 rounded-lg p-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow" />
              <span className="text-xs text-yellow">Mapa indisponível no momento</span>
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              <div className="absolute left-1/4 top-1/2 flex flex-col items-center" style={{ transform: 'translate(-50%, -50%)' }}>
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg ring-4 ring-green-500/30">
                  <Store className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs text-green-400 mt-1 font-medium bg-background/80 px-2 py-0.5 rounded">Loja</span>
              </div>

              {deliveryLocation && (
                <div className="absolute right-1/4 top-1/3 flex flex-col items-center" style={{ transform: 'translate(50%, -50%)' }}>
                  <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center shadow-lg ring-4 ring-red-500/30">
                    <Home className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs text-red-400 mt-1 font-medium bg-background/80 px-2 py-0.5 rounded">Entrega</span>
                </div>
              )}

              {motoboyLocation && (
                <div className="absolute left-1/2 top-1/2 flex flex-col items-center z-10" style={{ transform: 'translate(-50%, -50%)' }}>
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-pulse ring-4 ring-primary/30">
                    <Navigation2 className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <span className="text-xs text-primary mt-1 font-bold bg-background/80 px-2 py-0.5 rounded">🛵 Motoboy</span>
                </div>
              )}

              {deliveryLocation && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <defs>
                    <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" />
                      <stop offset="100%" stopColor="rgb(239 68 68)" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="25%"
                    y1="50%"
                    x2={motoboyLocation ? '50%' : '75%'}
                    y2={motoboyLocation ? '50%' : '33%'}
                    stroke="url(#routeGradient)"
                    strokeWidth="3"
                    strokeDasharray="8,6"
                    className="opacity-60"
                  />
                  {motoboyLocation && (
                    <line x1="50%" y1="50%" x2="75%" y2="33%" stroke="url(#routeGradient)" strokeWidth="3" strokeDasharray="8,6" className="opacity-60" />
                  )}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-xl overflow-hidden', className)} style={{ height }}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 z-10">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando mapa...</span>
          </div>
        </div>
      )}

      <iframe
        src={mapUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onLoad={handleLoad}
        onError={handleError}
        className={cn('transition-opacity duration-300', isLoading ? 'opacity-0' : 'opacity-100')}
      />
    </div>
  );
}
