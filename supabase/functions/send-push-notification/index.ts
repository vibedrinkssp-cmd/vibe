import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = 'mailto:admin@adegavm.com.br';

// --- Web Push Implementation (manual VAPID for Deno) ---

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importECDSAKey(raw: Uint8Array, isPrivate: boolean) {
  if (isPrivate) {
    // Convert raw 32-byte private key to JWK
    const jwk = {
      kty: 'EC',
      crv: 'P-256',
      d: base64UrlEncode(raw),
      x: '', // will be filled
      y: '',
    };
    // We need the public key to create a full JWK. Import via raw PKCS8 instead.
    // Actually, for signing we can use a minimal JWK approach
    // Let's use a different strategy: import the VAPID public key to get x,y
    return raw; // we'll handle signing differently
  }
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    [],
  );
}

async function createVapidJwt(audience: string): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 86400,
    sub: VAPID_SUBJECT,
  };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key as JWK
  const privateKeyRaw = base64UrlDecode(VAPID_PRIVATE_KEY);
  const publicKeyRaw = base64UrlDecode(VAPID_PUBLIC_KEY);

  // Extract x and y from uncompressed public key (65 bytes: 0x04 + 32x + 32y)
  const x = base64UrlEncode(publicKeyRaw.slice(1, 33));
  const y = base64UrlEncode(publicKeyRaw.slice(33, 65));

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x,
    y,
    d: base64UrlEncode(privateKeyRaw),
  };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  // Convert DER signature to raw r||s format (already raw from WebCrypto)
  const sigB64 = base64UrlEncode(signature);
  return `${unsignedToken}.${sigB64}`;
}

async function sendPushToSubscription(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
): Promise<boolean> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const jwt = await createVapidJwt(audience);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        TTL: '86400',
        Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
        Urgency: 'high',
      },
      body: new TextEncoder().encode(payload),
    });

    if (response.status === 201 || response.status === 200) {
      return true;
    }

    // 410 Gone or 404 = subscription expired
    if (response.status === 410 || response.status === 404) {
      console.log(`[Push] Subscription expired: ${subscription.endpoint.slice(0, 50)}...`);
      // Remove expired subscription
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const sb = createClient(supabaseUrl, serviceKey);
      await sb.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
    }

    console.warn(`[Push] Failed status ${response.status} for ${subscription.endpoint.slice(0, 50)}`);
    return false;
  } catch (err) {
    console.error(`[Push] Error sending to ${subscription.endpoint.slice(0, 50)}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { title, body, data, role } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Get push subscriptions, optionally filtered by role
    let query = sb.from('push_subscriptions').select('*');
    if (role) {
      query = query.eq('role', role);
    }
    const { data: subs, error } = await query;
    if (error) {
      console.error('[Push] Error fetching subscriptions:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({ title, body, data });
    const results = await Promise.allSettled(
      subs.map((sub: any) => sendPushToSubscription(sub, payload)),
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    console.log(`[Push] Sent ${sent}/${subs.length} notifications`);

    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Push] Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
