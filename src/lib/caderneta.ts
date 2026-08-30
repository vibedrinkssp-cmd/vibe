import { supabase } from '@/integrations/supabase/client-safe';
import { getAdminSessionToken } from '@/lib/admin-session';

export interface CadernetaCustomer {
  id: string;
  name: string;
  whatsapp: string | null;
  is_active: boolean | null;
  notes: string | null;
}

export interface CadernetaEntry {
  id: string;
  customer_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_paid: boolean | null;
  paid_at: string | null;
  created_at: string;
  notes: string | null;
}

export interface CadernetaPayment {
  id: string;
  customer_id: string;
  amount: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export interface RegisterCadernetaEntryItem {
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  salesperson?: string | null;
  notes?: string | null;
}

type GatewayResponse<T> = T & {
  error?: string;
};

/**
 * Resolve the best available session token from multiple sources:
 * 1. Explicit token passed by caller
 * 2. Admin/Manager session token (localStorage)
 * 3. Auth context token (localStorage)
 */
function resolveSessionToken(explicitToken: string | null): string | null {
  if (explicitToken) return explicitToken;

  // Try admin session (Manager panel stores its own token)
  const adminToken = getAdminSessionToken();
  if (adminToken) return adminToken;

  // Fallback to auth context token
  try {
    const stored = localStorage.getItem('vibe-drinks-session-token');
    if (stored) return stored;
  } catch {
    // ignore
  }

  return null;
}

function isSessionError(message: string): boolean {
  const lower = (message || '').toLowerCase();
  return (
    lower.includes('401') ||
    lower.includes('sessão') ||
    lower.includes('sessao') ||
    lower.includes('session') ||
    lower.includes('expired') ||
    lower.includes('expirad') ||
    lower.includes('inválid') ||
    lower.includes('invalid')
  );
}

const SESSION_EXPIRED_MESSAGE = 'Sessão expirada. Faça login novamente para continuar.';

async function invokeAdminCaderneta<T>(body: Record<string, unknown>, explicitToken: string | null): Promise<T> {
  const sessionToken = resolveSessionToken(explicitToken);

  const payload = {
    ...body,
    ...(sessionToken ? { sessionToken } : {}),
  };

  const { data, error } = await supabase.functions.invoke('admin-caderneta', {
    body: payload,
  });

  if (error) {
    const errorMsg = error.message || '';
    if (isSessionError(errorMsg)) {
      // Retry once with freshest token from admin-session helper
      const fallbackToken = getAdminSessionToken(explicitToken);
      if (fallbackToken && fallbackToken !== sessionToken) {
        const retryPayload = { ...body, sessionToken: fallbackToken };
        const { data: retryData, error: retryError } = await supabase.functions.invoke('admin-caderneta', {
          body: retryPayload,
        });
        if (!retryError && retryData) {
          const retryResponse = retryData as GatewayResponse<T>;
          if (!retryResponse.error) return retryResponse as T;
          if (retryResponse.error && !isSessionError(retryResponse.error)) {
            throw new Error(retryResponse.error);
          }
        }
      }
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    throw new Error(error.message || 'Falha ao acessar a caderneta');
  }

  const response = (data ?? null) as GatewayResponse<T> | null;

  if (!response) {
    throw new Error('Resposta inválida da caderneta');
  }

  if (response.error) {
    if (isSessionError(response.error)) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    throw new Error(response.error);
  }

  return response as T;
}


export async function listCadernetaCustomers(
  sessionToken: string | null,
  options?: { activeOnly?: boolean },
): Promise<{ customers: CadernetaCustomer[]; balances: Record<string, number> }> {
  return invokeAdminCaderneta<{ customers: CadernetaCustomer[]; balances: Record<string, number> }>({
    action: 'list-customers',
    activeOnly: options?.activeOnly ?? false,
  }, sessionToken);
}

export async function getCadernetaLedger(
  sessionToken: string | null,
  customerId: string,
): Promise<{ entries: CadernetaEntry[]; payments: CadernetaPayment[] }> {
  return invokeAdminCaderneta<{ entries: CadernetaEntry[]; payments: CadernetaPayment[] }>({
    action: 'get-ledger',
    customerId,
  }, sessionToken);
}

export async function createCadernetaCustomer(
  sessionToken: string | null,
  name: string,
): Promise<{ customer: CadernetaCustomer }> {
  return invokeAdminCaderneta<{ customer: CadernetaCustomer }>({
    action: 'create-customer',
    name,
  }, sessionToken);
}

export async function registerCadernetaEntries(
  sessionToken: string | null,
  params: { customerId: string; items: RegisterCadernetaEntryItem[] },
): Promise<{ success: true; count: number }> {
  return invokeAdminCaderneta<{ success: true; count: number }>({
    action: 'register-entries',
    customerId: params.customerId,
    items: params.items,
  }, sessionToken);
}

export async function registerCadernetaPayment(
  sessionToken: string | null,
  params: { customerId: string; amount: number; paymentMethod: string },
): Promise<{ payment: CadernetaPayment }> {
  return invokeAdminCaderneta<{ payment: CadernetaPayment }>({
    action: 'register-payment',
    customerId: params.customerId,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
  }, sessionToken);
}

export async function deleteCadernetaEntry(
  sessionToken: string | null,
  entryId: string,
): Promise<{ success: true }> {
  return invokeAdminCaderneta<{ success: true }>({
    action: 'delete-entry',
    entryId,
  }, sessionToken);
}
