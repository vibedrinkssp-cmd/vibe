// Safe Supabase client for Lovable Cloud remixes.
// Includes retry logic and cache-busting for iOS Safari compatibility.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Fallbacks must always point to the active backend for this project.
const FALLBACK_PROJECT_ID = "djkonftjquielnqejwht";
const FALLBACK_URL = `https://${FALLBACK_PROJECT_ID}.supabase.co`;
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa29uZnRqcXVpZWxucWVqd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzkxMzAsImV4cCI6MjA5MjA1NTEzMH0.kvsbBMplNdwS0oWu2J0xS_Nidc8dfvdasmDpm2kOog8";

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_URL = (rawUrl && rawUrl.startsWith('http')) ? rawUrl : FALLBACK_URL;

const rawKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';
// A valid Supabase key is either a legacy anon JWT ("ey...") or the newer
// publishable key format ("sb_publishable_...").
const SUPABASE_KEY = (rawKey && (rawKey.startsWith('ey') || rawKey.startsWith('sb_publishable_'))) ? rawKey : FALLBACK_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY && !import.meta.env.VITE_SUPABASE_ANON_KEY)) {
  console.warn("[supabase] Missing Vite env vars, using fallback client");
}

// Retry-capable fetch wrapper with circuit breaker to avoid retry storms
// when the backend is temporarily degraded.
const MAX_RETRIES = 2;
const BASE_RETRY_DELAY = 500;
// Higher threshold + shorter window so transient hiccups don't lock customers out
const FAILURE_THRESHOLD = 12;
const CIRCUIT_BREAKER_MS = 3_000;

type CircuitState = {
  consecutiveFailures: number;
  circuitOpenUntil: number;
};

const circuitStates = new Map<string, CircuitState>();

function getCircuitKey(url: string): string {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    if (pathname.includes('/functions/v1/')) {
      const fnName = pathname.split('/functions/v1/')[1]?.split('/')[0] || 'unknown';
      return `edge:${fnName}`;
    }

    if (pathname.includes('/rest/v1/')) {
      const resource = pathname.split('/rest/v1/')[1]?.split('/')[0] || 'unknown';
      return `rest:${resource}`;
    }

    if (pathname.includes('/auth/v1/')) {
      return 'auth';
    }

    if (pathname.includes('/storage/v1/')) {
      const bucket = pathname.split('/storage/v1/object/')[1]?.split('/')[0] || 'storage';
      return `storage:${bucket}`;
    }
  } catch {
    // ignore parse failures and fall back to a generic key
  }

  return 'supabase';
}

function getCircuitState(key: string): CircuitState {
  return circuitStates.get(key) ?? { consecutiveFailures: 0, circuitOpenUntil: 0 };
}

function setCircuitState(key: string, state: CircuitState) {
  if (state.consecutiveFailures === 0 && state.circuitOpenUntil === 0) {
    circuitStates.delete(key);
    return;
  }

  circuitStates.set(key, state);
}

function resetCircuitBreaker(key: string) {
  setCircuitState(key, { consecutiveFailures: 0, circuitOpenUntil: 0 });
}

function registerTransientFailure(key: string) {
  const state = getCircuitState(key);
  const consecutiveFailures = state.consecutiveFailures + 1;
  let circuitOpenUntil = state.circuitOpenUntil;

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_MS;
    console.warn(`[supabase] Circuit breaker opened for ${key} for ${CIRCUIT_BREAKER_MS}ms after repeated failures`);
  }

  setCircuitState(key, { consecutiveFailures, circuitOpenUntil });
}

export const resilientSupabaseFetch: typeof globalThis.fetch = async (input, init) => {
  let lastError: unknown;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const isRestApi = url.includes('/rest/v1/');
  const isEdgeFunction = url.includes('/functions/v1/');
  const isAuthApi = url.includes('/auth/v1/');
  const isStorageApi = url.includes('/storage/v1/');
  const isSupabaseApi = isRestApi || isEdgeFunction || isAuthApi || isStorageApi;

  // Determine HTTP method (default GET)
  const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? (input as Request).method : 'GET') || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';

  // Only apply circuit breaker to NON-read calls. Public reads (products, categories,
  // store info) must never be blocked — that prevents customers from browsing/ordering.
  const shouldUseCircuitBreaker = isSupabaseApi && !isRead && !isAuthApi;
  const circuitKey = shouldUseCircuitBreaker ? getCircuitKey(url) : null;

  if (circuitKey) {
    const state = getCircuitState(circuitKey);

    if (state.circuitOpenUntil > Date.now()) {
      return new Response(JSON.stringify({ message: 'Backend temporarily unavailable', resource: circuitKey }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (state.circuitOpenUntil && state.circuitOpenUntil <= Date.now()) {
      resetCircuitBreaker(circuitKey);
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Avoid cache-busting headers — they trigger CORS preflights and prevent
      // browser/CDN caching, slowing down repeated GETs significantly.
      const response = await globalThis.fetch(input, init);

      // Retry on transient 404 for REST AND Edge Functions (gru1 routing errors affect BOTH)
      if ((response.status === 404 || response.status === 406) && (isRestApi || isEdgeFunction)) {
        // Read the body to check if it's a genuine 404 vs gru1 routing error
        const clone = response.clone();
        let isGru1 = false;
        try {
          const text = await clone.text();
          // gru1 routing errors have empty body, generic HTML, or contain gru1/routing identifiers
          isGru1 = !text || text.includes('<!DOCTYPE') || text.includes('Cloudflare') 
            || text.includes('Connection timed out') || text.includes('gru1')
            || text.includes('worker not found') || text.includes('no healthy upstream')
            || text.length < 20;
        } catch {
          isGru1 = true; // Can't read body = likely transient
        }

        if (isGru1) {
          if (attempt < MAX_RETRIES) {
            console.warn(`[supabase] gru1 transient ${response.status} on ${isEdgeFunction ? 'edge-fn' : 'rest'} attempt ${attempt + 1}, retrying...`);
            await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * (attempt + 1)));
            continue;
          }

          if (circuitKey) registerTransientFailure(circuitKey);
          return response;
        }

        if (circuitKey) resetCircuitBreaker(circuitKey);
        return response;
      }

      // Retry on server errors (500-504) for any Supabase call
      if (isSupabaseApi && response.status >= 500 && response.status <= 504) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[supabase] Server error ${response.status} on attempt ${attempt + 1}, retrying...`);
          await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * (attempt + 1)));
          continue;
        }

        if (circuitKey) registerTransientFailure(circuitKey);
        return response;
      }

      // Retry on 408 (Request Timeout) and 429 (Rate Limit)
      if (isSupabaseApi && (response.status === 408 || response.status === 429)) {
        if (attempt < MAX_RETRIES) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? Math.min(Number(retryAfter) * 1000, 5000) : BASE_RETRY_DELAY * (attempt + 1);
          console.warn(`[supabase] Status ${response.status} on attempt ${attempt + 1}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (circuitKey) registerTransientFailure(circuitKey);
        return response;
      }

      if (isSupabaseApi && circuitKey) {
        resetCircuitBreaker(circuitKey);
      }

      return response;
    } catch (err) {
      lastError = err;
      // Network errors (TypeError: Failed to fetch) are common on mobile — always retry
      if (attempt < MAX_RETRIES) {
        console.warn(`[supabase] Network error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying...`, 
          err instanceof Error ? err.message : err);
        await new Promise(r => setTimeout(r, BASE_RETRY_DELAY * (attempt + 1)));
      }
    }
  }

  // All retries exhausted — return a synthetic 503 instead of throwing
  if (circuitKey) registerTransientFailure(circuitKey);
  if (lastError instanceof Response) return lastError;
  return new Response(JSON.stringify({ message: 'Backend temporarily unavailable', resource: circuitKey }), {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'application/json' },
  });
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: resilientSupabaseFetch,
  },
});
