import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.24.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STAFF_ROLES = new Set(['admin', 'pdv']);
const ADMIN_ROLES = new Set(['admin']);
const PAYMENT_METHODS = ['cash', 'pix', 'card_credit', 'card_debit'] as const;

const EntryPayloadSchema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string().trim().min(1).max(240),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  salesperson: z.string().trim().min(1).max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

type EntryPayload = z.infer<typeof EntryPayloadSchema>;

type CustomerRow = {
  id: string;
  name: string;
  whatsapp: string | null;
  is_active: boolean | null;
  notes: string | null;
};

type EntryBalanceRow = {
  customer_id: string;
  total_price: number | string | null;
};

type PaymentBalanceRow = {
  customer_id: string;
  amount: number | string | null;
};

// Accept sessionToken as any non-empty string (not only UUID) for resilience
const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list-customers'), sessionToken: z.string().min(1).optional(), activeOnly: z.boolean().optional() }).passthrough(),
  z.object({ action: z.literal('get-ledger'), sessionToken: z.string().min(1).optional(), customerId: z.string().uuid() }).passthrough(),
  z.object({ action: z.literal('create-customer'), sessionToken: z.string().min(1).optional(), name: z.string().trim().min(1).max(120) }).passthrough(),
  z.object({
    action: z.literal('register-entries'),
    sessionToken: z.string().min(1).optional(),
    customerId: z.string().uuid(),
    items: z.array(EntryPayloadSchema).min(1),
  }).passthrough(),
  z.object({ action: z.literal('register-payment'), sessionToken: z.string().min(1).optional(), customerId: z.string().uuid(), amount: z.number().positive(), paymentMethod: z.enum(PAYMENT_METHODS) }).passthrough(),
  z.object({
    action: z.literal('register-legacy-entry'),
    sessionToken: z.string().min(1).optional(),
    customerId: z.string().uuid(),
    description: z.string().trim().min(1).max(240),
    totalAmount: z.number().positive(),
    entryDate: z.string().datetime().nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }).passthrough(),
  z.object({ action: z.literal('delete-entry'), sessionToken: z.string().min(1).optional(), entryId: z.string().uuid() }).passthrough(),
  z.object({ action: z.literal('delete-customer'), sessionToken: z.string().min(1).optional(), customerId: z.string().uuid() }).passthrough(),
]);

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Validate via custom session token
async function validateSessionByToken(supabase: ReturnType<typeof createClient>, sessionToken: string) {
  const { data: session, error } = await (supabase.from('sessions') as any)
    .select('user_id, role, is_active, expires_at')
    .eq('token', sessionToken)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !session) return null;
  return session as { user_id: string; role: string; is_active: boolean; expires_at: string };
}

// Validate via Supabase Auth JWT (Authorization header)
async function validateSessionByAuth(supabase: ReturnType<typeof createClient>, authHeader: string) {
  try {
    const token = authHeader.replace('Bearer ', '');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;

    const userId = data.user.id;

    // Look up user's role
    const { data: roles, error: roleError } = await (supabase.from('user_roles') as any)
      .select('role')
      .eq('user_id', userId);

    if (roleError || !roles?.length) return null;

    // Pick the highest-priority staff role
    const roleSet = new Set(roles.map((r: any) => r.role));
    const role = roleSet.has('admin') ? 'admin' : roleSet.has('pdv') ? 'pdv' : roleSet.has('kitchen') ? 'kitchen' : roleSet.has('log') ? 'log' : roles[0].role;

    return { user_id: userId, role, is_active: true, expires_at: '' };
  } catch {
    return null;
  }
}

async function validateSession(supabase: ReturnType<typeof createClient>, sessionToken: string | undefined, authHeader: string | null) {
  // Try session token first (most reliable — custom session table with 24h expiry)
  if (sessionToken) {
    const session = await validateSessionByToken(supabase, sessionToken);
    if (session) return session;
    console.warn('[admin-caderneta] Session token provided but invalid/expired, trying auth header...');
  }

  // Fallback to Authorization header (Supabase Auth JWT)
  if (authHeader?.startsWith('Bearer ')) {
    const session = await validateSessionByAuth(supabase, authHeader);
    if (session) return session;
    console.warn('[admin-caderneta] Auth header provided but invalid/expired');
  }

  const hint = sessionToken ? ' (token provided but expired)' : ' (no token provided)';
  throw new HttpError(401, `Sessão administrativa inválida${hint}`);
}

function ensureRole(role: string, allowedRoles: Set<string>) {
  if (!allowedRoles.has(role)) throw new HttpError(403, 'Acesso negado para esta ação');
}

async function listCustomers(supabase: ReturnType<typeof createClient>, activeOnly: boolean) {
  let customersQuery = (supabase.from('caderneta_customers') as any)
    .select('id, name, whatsapp, is_active, notes')
    .order('name', { ascending: true });

  if (activeOnly) customersQuery = customersQuery.eq('is_active', true);

  const [customersResult, entriesResult, paymentsResult] = await Promise.all([
    customersQuery,
    (supabase.from('caderneta_entries') as any).select('customer_id, total_price'),
    (supabase.from('caderneta_payments') as any).select('customer_id, amount'),
  ]);

  if (customersResult.error) throw new HttpError(500, customersResult.error.message);
  if (entriesResult.error) throw new HttpError(500, entriesResult.error.message);
  if (paymentsResult.error) throw new HttpError(500, paymentsResult.error.message);

  const balances: Record<string, number> = {};
  const entries = (entriesResult.data ?? []) as EntryBalanceRow[];
  const payments = (paymentsResult.data ?? []) as PaymentBalanceRow[];

  for (const entry of entries) {
    balances[entry.customer_id] = (balances[entry.customer_id] || 0) + Number(entry.total_price || 0);
  }

  for (const payment of payments) {
    balances[payment.customer_id] = (balances[payment.customer_id] || 0) - Number(payment.amount || 0);
  }

  return {
    customers: (customersResult.data ?? []) as CustomerRow[],
    balances,
  };
}

async function getLedger(supabase: ReturnType<typeof createClient>, customerId: string) {
  const [entriesResult, paymentsResult] = await Promise.all([
    (supabase.from('caderneta_entries') as any)
      .select('id, customer_id, product_name, quantity, unit_price, total_price, is_paid, paid_at, created_at, notes')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
    (supabase.from('caderneta_payments') as any)
      .select('id, customer_id, amount, payment_method, notes, created_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false }),
  ]);

  if (entriesResult.error) throw new HttpError(500, entriesResult.error.message);
  if (paymentsResult.error) throw new HttpError(500, paymentsResult.error.message);

  return {
    entries: entriesResult.data ?? [],
    payments: paymentsResult.data ?? [],
  };
}

async function createCustomer(supabase: ReturnType<typeof createClient>, name: string) {
  const { data, error } = await (supabase.from('caderneta_customers') as any)
    .insert({ name: name.trim().toUpperCase(), is_active: true })
    .select('id, name, whatsapp, is_active, notes')
    .single();

  if (error) throw new HttpError(500, error.message);
  return { customer: data as CustomerRow };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function registerEntries(supabase: ReturnType<typeof createClient>, customerId: string, items: EntryPayload[]) {
  for (const item of items) {
    // Sanitize product_id: only pass valid UUIDs, otherwise null
    const safeProductId = item.productId && UUID_RE.test(item.productId) ? item.productId : null;

    const { error } = await supabase.rpc('create_caderneta_entry', {
      p_customer_id: customerId,
      p_product_name: item.productName,
      p_quantity: item.quantity,
      p_unit_price: item.unitPrice,
      p_total_price: item.totalPrice,
      p_product_id: safeProductId,
      p_salesperson: item.salesperson ?? null,
      p_notes: item.notes ?? null,
    });

    if (error) throw new HttpError(500, error.message);
  }

  return { success: true as const, count: items.length };
}

// Fiado antigo (anotado no caderno de papel, de antes do sistema). Ao
// contrário de registerEntries/create_caderneta_entry, NUNCA resolve
// product_id (nem por id, nem por nome de produto) e por isso nunca aciona
// deduct_product_stock — só grava o valor devido, com data retroativa
// opcional. Evita abater estoque de uma venda que já aconteceu há muito tempo.
async function registerLegacyEntry(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  description: string,
  totalAmount: number,
  entryDate: string | null | undefined,
  notes: string | null | undefined,
) {
  const tag = '📒 Fiado antigo (caderneta de papel)';
  const combinedNotes = notes ? `${tag}\n${notes}` : tag;

  const { data, error } = await (supabase.from('caderneta_entries') as any)
    .insert({
      customer_id: customerId,
      product_id: null,
      product_name: description,
      quantity: 1,
      unit_price: totalAmount,
      total_price: totalAmount,
      notes: combinedNotes,
      ...(entryDate ? { created_at: entryDate } : {}),
    })
    .select('id, customer_id, product_name, quantity, unit_price, total_price, is_paid, paid_at, created_at, notes')
    .single();

  if (error) throw new HttpError(500, error.message);
  return { entry: data };
}

async function registerPayment(supabase: ReturnType<typeof createClient>, customerId: string, amount: number, paymentMethod: (typeof PAYMENT_METHODS)[number]) {
  const { data, error } = await (supabase.from('caderneta_payments') as any)
    .insert({ customer_id: customerId, amount, payment_method: paymentMethod })
    .select('id, customer_id, amount, payment_method, notes, created_at')
    .single();

  if (error) throw new HttpError(500, error.message);
  return { payment: data };
}

async function deleteEntry(supabase: ReturnType<typeof createClient>, entryId: string) {
  const { data, error } = await (supabase.from('caderneta_entries') as any)
    .delete()
    .eq('id', entryId)
    .select('id')
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Lançamento não encontrado');
  return { success: true as const };
}

async function deleteCustomer(supabase: ReturnType<typeof createClient>, customerId: string) {
  // Cascade: caderneta_entries e caderneta_payments têm ON DELETE CASCADE em customer_id.
  const { data, error } = await (supabase.from('caderneta_customers') as any)
    .delete()
    .eq('id', customerId)
    .select('id')
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Cliente não encontrado');
  return { success: true as const };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new HttpError(500, 'Configuração do servidor inválida');

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get('Authorization');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Corpo da requisição inválido');
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      console.error('[admin-caderneta] Zod validation failed:', JSON.stringify(parsed.error.issues), 'Body action:', (body as any)?.action);
      throw new HttpError(400, 'Parâmetros inválidos para a operação da caderneta');
    }

    const session = await validateSession(supabase, parsed.data.sessionToken, authHeader);

    switch (parsed.data.action) {
      case 'list-customers':
        ensureRole(session.role, STAFF_ROLES);
        return new Response(JSON.stringify(await listCustomers(supabase, parsed.data.activeOnly ?? false)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'get-ledger':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await getLedger(supabase, parsed.data.customerId)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'create-customer':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await createCustomer(supabase, parsed.data.name)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'register-entries':
        ensureRole(session.role, STAFF_ROLES);
        return new Response(JSON.stringify(await registerEntries(supabase, parsed.data.customerId, parsed.data.items)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'register-payment':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await registerPayment(supabase, parsed.data.customerId, parsed.data.amount, parsed.data.paymentMethod)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'register-legacy-entry':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await registerLegacyEntry(supabase, parsed.data.customerId, parsed.data.description, parsed.data.totalAmount, parsed.data.entryDate, parsed.data.notes)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'delete-entry':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await deleteEntry(supabase, parsed.data.entryId)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      case 'delete-customer':
        ensureRole(session.role, ADMIN_ROLES);
        return new Response(JSON.stringify(await deleteCustomer(supabase, parsed.data.customerId)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    const status = error instanceof HttpError ? error.status : 500;
    console.error('[admin-caderneta] Error:', error);
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
