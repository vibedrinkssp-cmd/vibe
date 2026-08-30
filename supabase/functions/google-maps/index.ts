import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Service role client para escrever no cache (bypass RLS controlado)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fallbackPayload(action: string, error: string) {
  switch (action) {
    case 'getApiKey':
      return { apiKey: null, error, fallback: true };
    case 'autocomplete':
      return { predictions: [], error, fallback: true };
    case 'placeDetails':
      return { result: null, error, fallback: true };
    case 'geocode':
    case 'reverseGeocode':
      return { results: [], error, fallback: true };
    case 'directions':
      return { routes: [], error, fallback: true };
    case 'distanceMatrix':
      return { rows: [], error, fallback: true };
    default:
      return { error, fallback: true };
  }
}

// ===== CACHE HELPERS =====
function normalizeAddress(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function reverseCacheKey(lat: number, lng: number): string {
  // Arredonda para ~11m de precisão (4 casas decimais)
  return `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function forwardCacheKey(input: string): string {
  return `fwd:${normalizeAddress(input)}`;
}

interface CachedEntry {
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  components: any;
}

async function readCache(cacheKey: string): Promise<CachedEntry | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('geocoding_cache')
      .select('formatted_address,latitude,longitude,street,number,neighborhood,city,state,zip_code,components')
      .eq('cache_key', cacheKey)
      .maybeSingle();
    if (error) {
      console.warn('[cache] read error', error.message);
      return null;
    }
    if (data) {
      // Atualiza last_used_at e hit_count em background (sem await)
      supabaseAdmin.rpc('increment_geocoding_cache_hit', { p_key: cacheKey })
        .then(() => {})
        .catch(() => {
          // Fallback se RPC não existir: update direto
          supabaseAdmin
            .from('geocoding_cache')
            .update({ last_used_at: new Date().toISOString() })
            .eq('cache_key', cacheKey)
            .then(() => {});
        });
    }
    return data as CachedEntry | null;
  } catch (e) {
    console.warn('[cache] read exception', e);
    return null;
  }
}

async function writeCache(cacheKey: string, queryType: 'forward' | 'reverse', entry: CachedEntry) {
  try {
    await supabaseAdmin
      .from('geocoding_cache')
      .upsert(
        {
          cache_key: cacheKey,
          query_type: queryType,
          ...entry,
        },
        { onConflict: 'cache_key' }
      );
  } catch (e) {
    console.warn('[cache] write exception', e);
  }
}

function parseGoogleResult(result: any): CachedEntry {
  const components = result.address_components || [];
  const geometry = result.geometry?.location;
  const findComponent = (types: string[]) => {
    const comp = components.find((c: any) => types.some((t) => c.types.includes(t)));
    return comp?.long_name || comp?.short_name || null;
  };
  return {
    formatted_address: result.formatted_address || null,
    latitude: geometry?.lat ?? 0,
    longitude: geometry?.lng ?? 0,
    street: findComponent(['route']),
    number: findComponent(['street_number']),
    neighborhood: findComponent(['sublocality', 'sublocality_level_1', 'neighborhood']),
    city: findComponent(['administrative_area_level_2', 'locality']),
    state: findComponent(['administrative_area_level_1']),
    zip_code: findComponent(['postal_code']),
    components,
  };
}

function cachedToGeocodingResult(entry: CachedEntry) {
  return {
    formatted_address: entry.formatted_address,
    geometry: {
      location: { lat: Number(entry.latitude), lng: Number(entry.longitude) },
    },
    address_components: entry.components || [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let action = '';

  try {
    const body = await req.json();
    action = body.action;
    const { input, placeId, latitude, longitude, origin, destination, sessionToken } = body;

    if (!GOOGLE_MAPS_API_KEY) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return jsonResponse(fallbackPayload(action, 'Google Maps indisponível'));
    }

    console.log(`[google-maps] Action: ${action}, Input: ${input || placeId || `${latitude},${longitude}`}`);

    switch (action) {
      case 'getApiKey': {
        return jsonResponse({ apiKey: GOOGLE_MAPS_API_KEY });
      }

      case 'autocomplete': {
        // Bias autocomplete around the configured store location so endereços
        // próximos da loja sejam priorizados (evita sugerir rua de mesmo nome
        // em outra cidade, o que gerava taxa de entrega absurda).
        let biasLat = -23.1791;
        let biasLng = -45.8872;
        try {
          const { data: storeRow } = await supabaseAdmin
            .from('settings')
            .select('store_lat, store_lng')
            .limit(1)
            .maybeSingle();
          if (storeRow?.store_lat != null && storeRow?.store_lng != null) {
            biasLat = Number(storeRow.store_lat);
            biasLng = Number(storeRow.store_lng);
          }
        } catch (_) { /* fallback to defaults */ }

        const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
        url.searchParams.set('input', input);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('components', 'country:br');
        url.searchParams.set('types', 'address');
        // locationbias com circle estrito: prioriza fortemente endereços a até 25km da loja
        url.searchParams.set('locationbias', `circle:25000@${biasLat},${biasLng}`);
        url.searchParams.set('location', `${biasLat},${biasLng}`);
        url.searchParams.set('radius', '25000');
        if (sessionToken) url.searchParams.set('sessiontoken', sessionToken);

        const response = await fetch(url.toString());
        const data = await response.json();
        console.log(`[google-maps] Autocomplete returned ${data.predictions?.length || 0} results`);
        return jsonResponse(data);
      }

      case 'placeDetails': {
        const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
        url.searchParams.set('place_id', placeId);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('fields', 'formatted_address,geometry,address_components,name');
        if (sessionToken) url.searchParams.set('sessiontoken', sessionToken);

        const response = await fetch(url.toString());
        const data = await response.json();

        // Salva no cache para futuros forward geocodes do mesmo endereço
        if (data.result?.formatted_address) {
          const entry = parseGoogleResult(data.result);
          const fwdKey = forwardCacheKey(data.result.formatted_address);
          writeCache(fwdKey, 'forward', entry).catch(() => {});
        }

        return jsonResponse(data);
      }

      case 'geocode': {
        // 1) Tenta cache
        const cacheKey = forwardCacheKey(input);
        const cached = await readCache(cacheKey);
        if (cached) {
          console.log(`[google-maps] CACHE HIT geocode: ${cacheKey}`);
          return jsonResponse({ results: [cachedToGeocodingResult(cached)], cached: true });
        }

        // 2) Chama Google — com bounds em torno da loja para priorizar resultados locais
        let biasLat = -23.1791;
        let biasLng = -45.8872;
        try {
          const { data: storeRow } = await supabaseAdmin
            .from('settings')
            .select('store_lat, store_lng')
            .limit(1)
            .maybeSingle();
          if (storeRow?.store_lat != null && storeRow?.store_lng != null) {
            biasLat = Number(storeRow.store_lat);
            biasLng = Number(storeRow.store_lng);
          }
        } catch (_) { /* fallback */ }

        // ~0.25 graus ≈ 25-28km — caixa em torno da loja
        const delta = 0.25;
        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('address', input);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('components', 'country:BR');
        url.searchParams.set('bounds', `${biasLat - delta},${biasLng - delta}|${biasLat + delta},${biasLng + delta}`);

        const response = await fetch(url.toString());
        const data = await response.json();

        // 3) Salva no cache
        if (data.results?.[0]) {
          const entry = parseGoogleResult(data.results[0]);
          if (entry.latitude && entry.longitude) {
            writeCache(cacheKey, 'forward', entry).catch(() => {});
          }
        }

        return jsonResponse(data);
      }

      case 'reverseGeocode': {
        const cacheKey = reverseCacheKey(latitude, longitude);
        const cached = await readCache(cacheKey);
        if (cached) {
          console.log(`[google-maps] CACHE HIT reverse: ${cacheKey}`);
          return jsonResponse({ results: [cachedToGeocodingResult(cached)], cached: true });
        }

        const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        url.searchParams.set('latlng', `${latitude},${longitude}`);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('result_type', 'street_address|route|sublocality');

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.results?.[0]) {
          const entry = parseGoogleResult(data.results[0]);
          // Sobrescreve com lat/lng REAIS solicitados (manter precisão original)
          entry.latitude = latitude;
          entry.longitude = longitude;
          writeCache(cacheKey, 'reverse', entry).catch(() => {});
        }

        return jsonResponse(data);
      }

      case 'directions': {
        const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
        url.searchParams.set('origin', origin);
        url.searchParams.set('destination', destination);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('mode', 'driving');
        url.searchParams.set('alternatives', 'false');

        const response = await fetch(url.toString());
        const data = await response.json();
        return jsonResponse(data);
      }

      case 'distanceMatrix': {
        const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
        url.searchParams.set('origins', origin);
        url.searchParams.set('destinations', destination);
        url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
        url.searchParams.set('language', 'pt-BR');
        url.searchParams.set('mode', 'driving');

        const response = await fetch(url.toString());
        const data = await response.json();
        return jsonResponse(data);
      }

      default:
        return jsonResponse({ error: 'Invalid action' }, 400);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[google-maps] Error:', errorMessage);
    return jsonResponse(fallbackPayload(action, errorMessage));
  }
});
