/**
 * Resilient RPC helper — wraps supabase.rpc() with automatic retry
 * for transient gru1 404 errors and network failures.
 * 
 * NOTE: The client-safe.ts fetch wrapper already handles HTTP-level retries.
 * This layer adds RPC-level retry for Supabase SDK errors that don't surface
 * as HTTP errors (e.g. PostgREST parse errors, connection resets).
 */
import { supabase } from '@/integrations/supabase/client-safe';

const MAX_RPC_RETRIES = 2;
const RETRY_DELAY_MS = 500;

type RpcResult<T> = { data: T | null; error: any };

/**
 * Call a Supabase RPC function with automatic retry on transient errors.
 * Drop-in replacement for `supabase.rpc(fn, params)`.
 */
export async function resilientRpc<T = any>(
  fnName: string,
  params?: Record<string, unknown>
): Promise<RpcResult<T>> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RPC_RETRIES; attempt++) {
    try {
      const result = params
        ? await (supabase.rpc as any)(fnName, params)
        : await (supabase.rpc as any)(fnName);

      const { data, error } = result as any;

      // If no error, return immediately
      if (!error) {
        return { data: data as T, error: null };
      }

      // Check if this is a transient error worth retrying
      const msg = error.message || '';
      const code = error.code || '';
      const isTransient =
        code === '404' ||
        code === 'PGRST301' ||
        code === 'PGRST000' ||
        msg.includes('404') ||
        msg.includes('FetchError') ||
        msg.includes('Failed to fetch') ||
        msg.includes('network') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('aborted') ||
        msg.includes('timeout') ||
        msg.includes('Connection reset');
      const isCircuitOpen = msg.includes('temporarily unavailable');

      if (isCircuitOpen) {
        return { data: null, error };
      }

      if (isTransient && attempt < MAX_RPC_RETRIES) {
        console.warn(`[resilientRpc] ${fnName} transient error (attempt ${attempt + 1}/${MAX_RPC_RETRIES}):`, msg);
        await delay(RETRY_DELAY_MS * (attempt + 1));
        lastError = error;
        continue;
      }

      // Non-transient error or retries exhausted
      return { data: null, error };
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes('temporarily unavailable')) {
        break;
      }
      if (attempt < MAX_RPC_RETRIES) {
        console.warn(`[resilientRpc] ${fnName} exception (attempt ${attempt + 1}/${MAX_RPC_RETRIES}):`, err?.message);
        await delay(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  return { data: null, error: lastError };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
