import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client-safe';

interface PixPaymentData {
  payment_id: string;
  status: string;
  qr_code: string;
  qr_code_base64: string;
  ticket_url: string;
  expiration_date: string;
}

interface PaymentStatus {
  payment_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'in_process' | 'refunded';
  status_detail: string;
  date_approved?: string;
  transaction_amount: number;
  order_updated?: boolean;
}

const MAX_CALL_RETRIES = 2;

async function callMercadoPago(action: string, body: Record<string, unknown>, retries = MAX_CALL_RETRIES): Promise<any> {
  console.log(`[MercadoPago] Calling ${action} (retries left: ${retries})`);
  
  try {
    const { data, error } = await supabase.functions.invoke('mp-payments', {
      body: { ...body, action },
    });

    if (error) {
      console.error(`[MercadoPago] Error:`, error);
      if (retries > 0) {
        console.log(`[MercadoPago] Retrying ${action}...`);
        await new Promise(r => setTimeout(r, 1500));
        return callMercadoPago(action, body, retries - 1);
      }
      throw new Error(error.message || `Erro do servidor`);
    }

    console.log(`[MercadoPago] Response:`, JSON.stringify(data).substring(0, 500));
    
    if (data?.error) {
      if (retries > 0 && (data.error.includes('Erro') || data.error.includes('timeout'))) {
        console.log(`[MercadoPago] Retrying ${action} after server error...`);
        await new Promise(r => setTimeout(r, 1500));
        return callMercadoPago(action, body, retries - 1);
      }
      throw new Error(data.error);
    }

    return data;
  } catch (err) {
    if (retries > 0 && err instanceof TypeError) {
      // Network error — retry
      console.warn(`[MercadoPago] Network error, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
      return callMercadoPago(action, body, retries - 1);
    }
    throw err;
  }
}

export function useMercadoPago() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pixData, setPixData] = useState<PixPaymentData | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const approvedFiredRef = useRef(false);
  const pollingBusyRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);

  const createPixPayment = useCallback(async (
    amount: number,
    description: string,
    externalReference: string,
    payer?: { email?: string; first_name?: string; last_name?: string }
  ): Promise<PixPaymentData | null> => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[MercadoPago] Creating PIX payment:', { amount, description, externalReference });
      
      const result = await callMercadoPago('create_pix', {
        amount,
        description,
        external_reference: externalReference,
        payer,
      });

      if (!result?.payment_id) {
        throw new Error('Resposta inválida do Mercado Pago - sem payment_id');
      }

      console.log('[MercadoPago] Create PIX result:', result);
      setPixData(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('[MercadoPago] Create PIX error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const checkPaymentStatus = useCallback(async (paymentId: string, orderId?: string): Promise<PaymentStatus | null> => {
    try {
      console.log('[MercadoPago] checkPaymentStatus called with paymentId:', paymentId, 'orderId:', orderId);
      const body: Record<string, unknown> = { payment_id: paymentId };
      if (orderId) body.order_id = orderId;
      const result = await callMercadoPago('check_status', body, 1); // less retries for polling
      console.log('[MercadoPago] Payment status:', result);
      consecutiveErrorsRef.current = 0; // reset on success
      setPaymentStatus(result);
      return result;
    } catch (err) {
      consecutiveErrorsRef.current++;
      console.error('[MercadoPago] Check status error (consecutive:', consecutiveErrorsRef.current, '):', err);
      return null;
    }
  }, []);

  const startPolling = useCallback((
    paymentId: string, 
    onApproved: () => void, 
    intervalMs = 3000,
    orderId?: string
  ) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    approvedFiredRef.current = false;
    consecutiveErrorsRef.current = 0;

    const poll = async () => {
      if (approvedFiredRef.current || pollingBusyRef.current) return;
      
      // Stop polling after too many consecutive errors (network down)
      if (consecutiveErrorsRef.current >= 10) {
        console.error('[MercadoPago] Too many consecutive errors, stopping polling');
        stopPolling();
        return;
      }
      
      pollingBusyRef.current = true;
      try {
        const status = await checkPaymentStatus(paymentId, orderId);
        if (status?.status === 'approved' && !approvedFiredRef.current) {
          approvedFiredRef.current = true;
          stopPolling();
          console.log('[MercadoPago] ✅ Payment approved! Order updated server-side:', status.order_updated);
          onApproved();
        } else if (status?.status === 'rejected' || status?.status === 'cancelled') {
          console.log('[MercadoPago] Payment', status.status, '- stopping polling');
          stopPolling();
        }
      } finally {
        pollingBusyRef.current = false;
      }
    };

    // First poll immediately
    poll();
    // Then poll at interval, with slight jitter to avoid thundering herd
    const jitter = Math.random() * 500;
    pollingRef.current = setInterval(poll, intervalMs + jitter);
  }, [checkPaymentStatus]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const cancelPayment = useCallback(async (paymentId: string) => {
    try {
      const result = await callMercadoPago('cancel', { payment_id: paymentId });
      return result;
    } catch (err) {
      console.error('[MercadoPago] Cancel payment error:', err);
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    approvedFiredRef.current = false;
    pollingBusyRef.current = false;
    consecutiveErrorsRef.current = 0;
    setPixData(null);
    setPaymentStatus(null);
    setError(null);
  }, [stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    loading,
    error,
    pixData,
    paymentStatus,
    createPixPayment,
    checkPaymentStatus,
    startPolling,
    stopPolling,
    cancelPayment,
    reset,
  };
}
