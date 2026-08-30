// Reconciliação automática de pedidos PIX pendentes.
// Rodando via pg_cron a cada 1 minuto, varre pedidos pix `pending` com
// mp_payment_id (criados nas últimas 2h), consulta o Mercado Pago e,
// se status=approved, marca payment_confirmed=true / status=accepted.
//
// Funciona como rede de segurança caso:
//  - cliente fechou o app antes do polling confirmar
//  - webhook MP não chegou (URL não configurada / 5xx)
//
// Também tenta reconciliar por external_reference quando mp_payment_id está nulo,
// usando uma lista de payments recentes da conta MP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrderRow {
  id: string;
  mp_payment_id: string | null;
  created_at: string;
  total: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "MERCADO_PAGO_ACCESS_TOKEN ausente" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Buscar PIX pendentes recentes (últimas 2h)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: pending, error } = await supabase
    .from("orders")
    .select("id, mp_payment_id, created_at, total")
    .eq("status", "pending")
    .eq("payment_method", "pix")
    .gte("created_at", twoHoursAgo);

  if (error) {
    console.error("[mp-reconcile] fetch error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rows = (pending ?? []) as OrderRow[];
  console.log(`[mp-reconcile] ${rows.length} pedidos PIX pending nas últimas 2h`);

  let approvedCount = 0;
  let checkedCount = 0;
  let missingPaymentId = 0;
  const updates: Array<{ id: string; mp_payment_id: string }> = [];

  // 1) Para os que JÁ têm mp_payment_id: consulta direta
  const withId = rows.filter((r) => r.mp_payment_id);
  const withoutId = rows.filter((r) => !r.mp_payment_id);
  missingPaymentId = withoutId.length;

  for (const order of withId) {
    checkedCount++;
    try {
      const resp = await fetch(
        `https://api.mercadopago.com/v1/payments/${order.mp_payment_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) {
        console.warn(`[mp-reconcile] MP ${resp.status} para payment ${order.mp_payment_id}`);
        continue;
      }
      const payment = await resp.json();
      if (payment.status === "approved") {
        approvedCount++;
        updates.push({ id: order.id, mp_payment_id: String(order.mp_payment_id) });
      }
    } catch (err) {
      console.error(`[mp-reconcile] erro consultando ${order.mp_payment_id}:`, err);
    }
  }

  // 2) Para os SEM mp_payment_id: lista pagamentos aprovados das últimas 2h
  //    e tenta casar por external_reference (= order.id).
  if (withoutId.length > 0) {
    try {
      const begin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const searchUrl = `https://api.mercadopago.com/v1/payments/search?status=approved&range=date_created&begin_date=${encodeURIComponent(begin)}&end_date=NOW&limit=200`;
      const resp = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = (data?.results ?? []) as Array<{
          id: number | string;
          external_reference?: string;
          status: string;
        }>;
        const byRef = new Map<string, string>();
        for (const p of results) {
          if (p.external_reference && p.status === "approved") {
            byRef.set(p.external_reference, String(p.id));
          }
        }
        for (const order of withoutId) {
          const pid = byRef.get(order.id);
          if (pid) {
            approvedCount++;
            updates.push({ id: order.id, mp_payment_id: pid });
          }
        }
      } else {
        console.warn(`[mp-reconcile] search MP retornou ${resp.status}`);
      }
    } catch (err) {
      console.error("[mp-reconcile] erro no search MP:", err);
    }
  }

  // Aplica updates (optimistic lock no status pending)
  for (const u of updates) {
    const { error: updErr } = await supabase
      .from("orders")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        payment_confirmed: true,
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: "mp-reconcile",
        mp_payment_id: u.mp_payment_id,
        notes: `✅ PIX RECONCILIADO - MP #${u.mp_payment_id}`,
      })
      .eq("id", u.id)
      .eq("status", "pending");

    if (updErr) {
      console.error(`[mp-reconcile] erro atualizando ${u.id}:`, updErr);
    } else {
      console.log(`[mp-reconcile] ✅ pedido ${u.id} confirmado (mp ${u.mp_payment_id})`);

      // Cancela duplicatas: outros pedidos PIX pending do mesmo cliente
      // com mesmo total criados nas últimas 2h (cliente refez por engano).
      const confirmed = rows.find((r) => r.id === u.id);
      if (confirmed) {
        const { data: userRow } = await supabase
          .from("orders")
          .select("user_id")
          .eq("id", u.id)
          .single();
        if (userRow?.user_id) {
          const { data: dups } = await supabase
            .from("orders")
            .select("id")
            .eq("user_id", userRow.user_id)
            .eq("payment_method", "pix")
            .eq("status", "pending")
            .gte("created_at", twoHoursAgo)
            .neq("id", u.id);
          const dupIds = (dups ?? [])
            .filter(() => true)
            .map((d) => d.id);
          if (dupIds.length > 0) {
            // só cancela as que batem o total
            const { data: sameTotal } = await supabase
              .from("orders")
              .select("id, total")
              .in("id", dupIds);
            const toCancel = (sameTotal ?? [])
              .filter((d) => Math.abs(Number(d.total) - Number(confirmed.total)) < 0.01)
              .map((d) => d.id);
            if (toCancel.length > 0) {
              await supabase
                .from("orders")
                .update({
                  status: "cancelled",
                  notes: `🔁 CANCELADO AUTOMÁTICO - duplicata do pedido ${u.id} (PIX já pago)`,
                })
                .in("id", toCancel)
                .eq("status", "pending");
              console.log(`[mp-reconcile] 🔁 ${toCancel.length} duplicata(s) cancelada(s):`, toCancel);
            }
          }
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      scanned: rows.length,
      checked: checkedCount,
      missingPaymentId,
      approved: approvedCount,
      updated: updates.length,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
