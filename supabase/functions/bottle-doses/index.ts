import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Always return 200 with { success, error } so that supabase.functions.invoke
// surfaces the message instead of a generic "non-2xx status code".
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deduct_bottle_doses / return_bottle_doses foram revogadas de anon/authenticated
// (achado crítico de auditoria: qualquer visitante do site podia chamá-las
// direto via devtools com valores arbitrários). Esta função é o único caminho
// que ainda pode chamá-las (via service role), validando e limitando o valor
// antes de repassar — usada tanto pelo site do cliente (Monte seu
// Drink/Caipirinha/Copão/Caipi Ice) quanto pelo PDV/Cozinha.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Maior valor legítimo possível numa única chamada: 2 doses/garrafa (cap da UI)
// x 10 unidades (maxQuantity padrão do stepper de quantidade).
const MAX_DOSES_PER_CALL = 20;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, bottle_id, doses } = await req.json().catch(() => ({}));

    if (action !== "deduct" && action !== "return") {
      return jsonResponse({ success: false, error: "Ação inválida" });
    }
    if (typeof bottle_id !== "string" || !UUID_RE.test(bottle_id)) {
      return jsonResponse({ success: false, error: "ID da garrafa inválido" });
    }
    if (!Number.isInteger(doses) || doses < 1 || doses > MAX_DOSES_PER_CALL) {
      return jsonResponse({ success: false, error: "Quantidade de doses inválida" });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const rpcName = action === "deduct" ? "deduct_bottle_doses" : "return_bottle_doses";
    const rpcArgs = action === "deduct"
      ? { p_bottle_id: bottle_id, p_doses_used: doses }
      : { p_bottle_id: bottle_id, p_doses_returned: doses };

    const { error } = await supabaseAdmin.rpc(rpcName, rpcArgs);

    if (error) {
      // Erros de negócio (ex.: "Doses insuficientes") voltam com 200 pra UI
      // conseguir mostrar a mensagem real.
      return jsonResponse({ success: false, error: error.message });
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("bottle-doses internal error", err);
    return jsonResponse({ success: false, error: "Erro interno ao ajustar doses" }, 500);
  }
});
