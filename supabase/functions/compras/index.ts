import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Sempre 200 com { success, error }: o front mostra a mensagem em vez de "non-2xx".
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Login próprio da lista de compras (usuário + senha nos secrets COMPRAS_USER / COMPRAS_PASSWORD),
// separado dos PINs do painel: quem entra aqui só enxerga a lista, nunca o admin.
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_LOGIN_DELAY_MS = 800;
const encoder = new TextEncoder();

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function issueToken(secret: string): Promise<string> {
  const exp = String(Date.now() + TOKEN_TTL_MS);
  return `${exp}.${await sign(exp, secret)}`;
}

async function tokenIsValid(token: unknown, secret: string): Promise<boolean> {
  if (typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await sign(exp, secret));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, username, password, token } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const expectedUser = Deno.env.get("COMPRAS_USER");
    const expectedPassword = Deno.env.get("COMPRAS_PASSWORD");
    if (!supabaseUrl || !serviceKey || !expectedUser || !expectedPassword) {
      return jsonResponse({ success: false, error: "Lista de compras ainda não configurada (secrets COMPRAS_USER e COMPRAS_PASSWORD)." });
    }
    const secret = Deno.env.get("COMPRAS_TOKEN_SECRET") ?? serviceKey;

    if (action === "login") {
      const ok = typeof username === "string" && typeof password === "string"
        && safeEqual(username.trim().toLowerCase(), expectedUser.trim().toLowerCase())
        && safeEqual(password, expectedPassword);
      if (!ok) {
        await new Promise((r) => setTimeout(r, FAILED_LOGIN_DELAY_MS));
        return jsonResponse({ success: false, error: "Usuário ou senha incorretos" });
      }
      return jsonResponse({ success: true, token: await issueToken(secret) });
    }

    if (action === "list") {
      if (!(await tokenIsValid(token, secret))) {
        return jsonResponse({ success: false, expired: true, error: "Sessão expirada" });
      }
      const supabase = createClient(supabaseUrl, serviceKey);
      const [products, categories] = await Promise.all([
        supabase.from("products").select("id, name, stock, is_active, category_id").eq("is_active", true),
        supabase.from("categories").select("id, name"),
      ]);
      if (products.error || categories.error) {
        console.error("[compras] list failed:", products.error?.message, categories.error?.message);
        return jsonResponse({ success: false, error: "Não foi possível carregar a lista" });
      }
      return jsonResponse({ success: true, products: products.data, categories: categories.data });
    }

    return jsonResponse({ success: false, error: "Ação inválida" });
  } catch (err) {
    console.error("[compras] unexpected:", err);
    return jsonResponse({ success: false, error: "Erro interno" });
  }
});
