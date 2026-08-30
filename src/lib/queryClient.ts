import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { resilientSupabaseFetch } from "@/integrations/supabase/client-safe";
import {
  mapProduct,
  mapCategory,
  mapOrder,
  mapOrderItem,
  mapUser,
  mapMotoboy,
  mapBanner,
  mapSettings,
  mapAddress,
} from "./db-mappers";

// Use environment variables when available; otherwise use safe public fallbacks.
const FALLBACK_PROJECT_ID = "djkonftjquielnqejwht";
const FALLBACK_URL = `https://${FALLBACK_PROJECT_ID}.supabase.co`;
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa29uZnRqcXVpZWxucWVqd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzkxMzAsImV4cCI6MjA5MjA1NTEzMH0.kvsbBMplNdwS0oWu2J0xS_Nidc8dfvdasmDpm2kOog8";

const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  FALLBACK_ANON_KEY;

// Map table name to its mapper function
const tableMappers: Record<string, (item: Record<string, unknown>) => unknown> = {
  products: mapProduct,
  categories: mapCategory,
  orders: mapOrder,
  order_items: mapOrderItem,
  users: mapUser,
  motoboys: mapMotoboy,
  banners: mapBanner,
  settings: mapSettings,
  addresses: mapAddress,
};

// Convert camelCase keys to snake_case for DB operations
function convertToSnakeCase(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Parse the URL to extract table name and any filters
  let path = url.startsWith('/api') ? url.replace('/api/', '') : url.replace(/^\//, '');
  
  // Handle special cases like /orders/123/status
  const parts = path.split('/');
  const tableName = parts[0];
  const recordId = parts[1];
  
  let fullUrl: string;
  let body = data;
  
  // Convert camelCase data to snake_case for DB
  if (data && typeof data === 'object') {
    body = convertToSnakeCase(data as Record<string, unknown>);
  }
  
  if (method === 'GET') {
    fullUrl = `${SUPABASE_URL}/rest/v1/${tableName}?select=*`;
  } else if (method === 'PATCH' && recordId) {
    fullUrl = `${SUPABASE_URL}/rest/v1/${tableName}?id=eq.${recordId}`;
  } else if (method === 'DELETE' && recordId) {
    fullUrl = `${SUPABASE_URL}/rest/v1/${tableName}?id=eq.${recordId}`;
  } else if (method === 'POST') {
    fullUrl = `${SUPABASE_URL}/rest/v1/${tableName}`;
  } else {
    fullUrl = `${SUPABASE_URL}/rest/v1/${path}?select=*`;
  }
  
  const headers: Record<string, string> = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : 'return=minimal',
  };
  
  const res = await resilientSupabaseFetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  return async ({ queryKey }) => {
    const url = queryKey[0] as string;
    
    // Convert /api/xxx to Supabase REST API format
    const path = url.startsWith('/api/') ? url.replace('/api/', '') : url.startsWith('/api') ? url.replace('/api', '') : url.replace(/^\//, '');
    const tableName = path.split('?')[0].split('/')[0];
    
    const fullUrl = `${SUPABASE_URL}/rest/v1/${path}${path.includes('?') ? '&' : '?'}select=*`;
    
    const res = await resilientSupabaseFetch(fullUrl, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    if (options.on401 === "returnNull" && res.status === 401) {
      return null as T;
    }

    await throwIfResNotOk(res);
    const rawData = await res.json();
    
    // Apply mapper if available for this table
    const mapper = tableMappers[tableName];
    if (mapper && Array.isArray(rawData)) {
      return rawData.map(item => mapper(item)) as T;
    }
    
    return rawData as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 10,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});
