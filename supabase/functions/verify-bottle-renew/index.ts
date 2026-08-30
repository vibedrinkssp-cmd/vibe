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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bottle_id } = await req.json().catch(() => ({}));

    if (!bottle_id || typeof bottle_id !== "string") {
      return jsonResponse({ success: false, error: "ID da garrafa é obrigatório" });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabaseAdmin.rpc("renew_bottle", {
      p_bottle_id: bottle_id,
    });

    if (error) {
      // Business errors (e.g. "Garrafa ainda não está vazia") return 200
      // so the frontend can show the actual message.
      return jsonResponse({ success: false, error: error.message });
    }

    return jsonResponse({ success: true, bottle_id: data });
  } catch (err) {
    console.error("verify-bottle-renew internal error", err);
    return jsonResponse(
      { success: false, error: "Erro interno ao renovar garrafa" },
      500
    );
  }
});
