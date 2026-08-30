import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';

export interface PlacePrediction {
  description: string;
  place_id: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

export interface AddressComponents {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface DirectionsResult {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
  polyline: string;
}

// Cache em memória para Distance Matrix (chave = origin|destination arredondados)
// Evita cobrança repetida pelo mesmo cálculo dentro da sessão do navegador.
const distanceMatrixCache = new Map<string, { distance: number; duration: number; ts: number }>();
const DISTANCE_CACHE_TTL = 30 * 60 * 1000; // 30 min

function distanceCacheKey(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number }
) {
  const norm = (v: string | { lat: number; lng: number }) => {
    if (typeof v === 'string') return v;
    return `${v.lat.toFixed(4)},${v.lng.toFixed(4)}`;
  };
  return `${norm(origin)}|${norm(destination)}`;
}

function genSessionToken() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

export function useGoogleMaps() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Session token agrupa autocomplete + placeDetails como UMA cobrança no Google.
  const sessionTokenRef = useRef<string>(genSessionToken());

  const autocomplete = useCallback(async (input: string): Promise<PlacePrediction[]> => {
    if (!input || input.length < 3) return [];
    
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'autocomplete', input, sessionToken: sessionTokenRef.current }
      });
      
      if (error) throw error;
      
      return data.predictions || [];
    } catch (err: any) {
      console.error('[useGoogleMaps] Autocomplete error:', err);
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getPlaceDetails = useCallback(async (placeId: string): Promise<AddressComponents | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'placeDetails', placeId, sessionToken: sessionTokenRef.current }
      });
      
      if (error) throw error;
      
      const result = data.result;
      if (!result) return null;
      
      const components = result.address_components || [];
      const geometry = result.geometry?.location;
      
      // Parse address components
      const findComponent = (types: string[]) => {
        const comp = components.find((c: any) => types.some(t => c.types.includes(t)));
        return comp?.long_name || comp?.short_name || '';
      };
      
      const parsed = {
        street: findComponent(['route']),
        number: findComponent(['street_number']),
        neighborhood: findComponent(['sublocality', 'sublocality_level_1', 'neighborhood']),
        city: findComponent(['administrative_area_level_2', 'locality']),
        state: findComponent(['administrative_area_level_1']),
        zipCode: findComponent(['postal_code']),
        latitude: geometry?.lat || 0,
        longitude: geometry?.lng || 0,
        formattedAddress: result.formatted_address || '',
      };
      // Sessão encerrada após placeDetails — gera novo token para próxima busca
      sessionTokenRef.current = genSessionToken();
      return parsed;
    } catch (err: any) {
      console.error('[useGoogleMaps] Place details error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const geocodeAddress = useCallback(async (address: string): Promise<AddressComponents | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'geocode', input: address }
      });
      
      if (error) throw error;
      
      const result = data.results?.[0];
      if (!result) return null;
      
      const components = result.address_components || [];
      const geometry = result.geometry?.location;
      
      const findComponent = (types: string[]) => {
        const comp = components.find((c: any) => types.some(t => c.types.includes(t)));
        return comp?.long_name || comp?.short_name || '';
      };
      
      return {
        street: findComponent(['route']),
        number: findComponent(['street_number']),
        neighborhood: findComponent(['sublocality', 'sublocality_level_1', 'neighborhood']),
        city: findComponent(['administrative_area_level_2', 'locality']),
        state: findComponent(['administrative_area_level_1']),
        zipCode: findComponent(['postal_code']),
        latitude: geometry?.lat || 0,
        longitude: geometry?.lng || 0,
        formattedAddress: result.formatted_address || '',
      };
    } catch (err: any) {
      console.error('[useGoogleMaps] Geocode error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reverseGeocode = useCallback(async (latitude: number, longitude: number): Promise<AddressComponents | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'reverseGeocode', latitude, longitude }
      });
      
      if (error) throw error;
      
      const result = data.results?.[0];
      if (!result) return null;
      
      const components = result.address_components || [];
      
      const findComponent = (types: string[]) => {
        const comp = components.find((c: any) => types.some(t => c.types.includes(t)));
        return comp?.long_name || comp?.short_name || '';
      };
      
      return {
        street: findComponent(['route']),
        number: findComponent(['street_number']),
        neighborhood: findComponent(['sublocality', 'sublocality_level_1', 'neighborhood']),
        city: findComponent(['administrative_area_level_2', 'locality']),
        state: findComponent(['administrative_area_level_1']),
        zipCode: findComponent(['postal_code']),
        latitude,
        longitude,
        formattedAddress: result.formatted_address || '',
      };
    } catch (err: any) {
      console.error('[useGoogleMaps] Reverse geocode error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDirections = useCallback(async (
    origin: string | { lat: number; lng: number },
    destination: string | { lat: number; lng: number }
  ): Promise<DirectionsResult | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const originStr = typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`;
      const destStr = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;
      
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'directions', origin: originStr, destination: destStr }
      });
      
      if (error) throw error;
      
      const route = data.routes?.[0];
      const leg = route?.legs?.[0];
      
      if (!leg) return null;
      
      return {
        distance: leg.distance,
        duration: leg.duration,
        polyline: route.overview_polyline?.points || '',
      };
    } catch (err: any) {
      console.error('[useGoogleMaps] Directions error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getDistanceMatrix = useCallback(async (
    origin: string | { lat: number; lng: number },
    destination: string | { lat: number; lng: number }
  ): Promise<{ distance: number; duration: number } | null> => {
    // Verifica cache primeiro — evita cobrança do Google para o mesmo destino
    const cacheKey = distanceCacheKey(origin, destination);
    const cached = distanceMatrixCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DISTANCE_CACHE_TTL) {
      return { distance: cached.distance, duration: cached.duration };
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const originStr = typeof origin === 'string' ? origin : `${origin.lat},${origin.lng}`;
      const destStr = typeof destination === 'string' ? destination : `${destination.lat},${destination.lng}`;
      
      const { data, error } = await supabase.functions.invoke('google-maps', {
        body: { action: 'distanceMatrix', origin: originStr, destination: destStr }
      });
      
      if (error) throw error;
      
      const element = data.rows?.[0]?.elements?.[0];
      
      if (!element || element.status !== 'OK') return null;
      
      const result = {
        distance: element.distance.value, // meters
        duration: element.duration.value, // seconds
      };
      distanceMatrixCache.set(cacheKey, { ...result, ts: Date.now() });
      return result;
    } catch (err: any) {
      console.error('[useGoogleMaps] Distance matrix error:', err);
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    autocomplete,
    getPlaceDetails,
    geocodeAddress,
    reverseGeocode,
    getDirections,
    getDistanceMatrix,
  };
}
