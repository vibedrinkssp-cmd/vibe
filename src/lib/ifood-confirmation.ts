/**
 * iFood delivery confirmation helpers.
 *
 * The confirmation page is a FIXED URL — we never append dynamic params.
 * We only copy the localizador code to the clipboard so the motoboy can
 * paste it on the iFood page.
 */

const IFOOD_CONFIRMATION_URL =
  'https://confirmacao-entrega-propria.ifood.com.br/numero-pedido';

/** Strip non-digits and keep exactly 8 characters. */
export function normalizeLocalizador(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

/** Parse the <!--META:{...}--> block stored in order.notes */
export function parseIfoodMeta(notes?: string | null): Record<string, string> | null {
  if (!notes) return null;
  const match = notes.match(/<!--META:(.+?)-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/** Get the localizador from order notes. */
export function getLocalizador(notes?: string | null): string | null {
  const meta = parseIfoodMeta(notes);
  return meta?.localizador ?? null;
}

/**
 * Copy code to clipboard, vibrate, and open the iFood confirmation page.
 * Returns true if the code was valid and actions were performed.
 */
export async function confirmarIfood(codigo: string): Promise<boolean> {
  const limpo = normalizeLocalizador(codigo);
  if (limpo.length !== 8) return false;

  try {
    await navigator.clipboard.writeText(limpo);
  } catch {
    // clipboard may fail on some browsers — still proceed
  }
  navigator.vibrate?.(100);
  window.open(IFOOD_CONFIRMATION_URL, '_blank');
  return true;
}

/**
 * Copy the normalized code to clipboard with vibration feedback.
 * Returns true on success.
 */
export async function copiarCodigo(codigo: string): Promise<boolean> {
  const limpo = normalizeLocalizador(codigo);
  if (limpo.length !== 8) return false;

  try {
    await navigator.clipboard.writeText(limpo);
    navigator.vibrate?.(100);
    return true;
  } catch {
    return false;
  }
}
