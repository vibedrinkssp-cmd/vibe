// Impressão do totem para Linux via agente Python local (USB ESC/POS direto).
//
// COMO FUNCIONA:
//   - O navegador NÃO imprime via window.print().
//   - O totem (Linux) roda um pequeno servidor HTTP local em Python que recebe
//     o JSON do ticket e envia comandos ESC/POS direto pra impressora USB
//     usando python-escpos (libusb). Sem driver CUPS, sem diálogo, sem dor.
//
//   - Endpoint padrão: http://127.0.0.1:9100/print  (POST JSON)
//   - Override em runtime via localStorage.setItem('TOTEM_PRINT_AGENT_URL', '...')
//
// O script de referência do agente Python está em `scripts/totem-print-agent.py`.
//
// Como no totem do Windows, este módulo NUNCA lança exceção que bloqueie o
// fluxo do pedido — falhas são apenas logadas. O pedido já está salvo.

interface TicketItem {
  name: string;
  qty: number;
}

interface PrintTicketParams {
  customerName: string;
  orderCode: string;
  items: TicketItem[];
}

const DEFAULT_AGENT_URL = 'http://127.0.0.1:9100/print';
const REQUEST_TIMEOUT_MS = 4000;

function getAgentUrl(): string {
  try {
    const override = localStorage.getItem('TOTEM_PRINT_AGENT_URL');
    if (override && override.trim()) return override.trim();
  } catch {}
  return DEFAULT_AGENT_URL;
}

async function postOnce(url: string, payload: unknown): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
      // mode default: cors. Agente local responde Access-Control-Allow-Origin: *.
    });
    if (!res.ok) {
      console.warn('[printTotemLinux] agente respondeu', res.status, await res.text().catch(() => ''));
      return false;
    }
    console.log('[printTotemLinux] ticket enviado ao agente USB');
    return true;
  } catch (err) {
    console.error('[printTotemLinux] erro chamando agente:', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envia o ticket ao agente Python local que imprime via USB ESC/POS.
 * Faz 1 retry com 800ms se a primeira tentativa falhar.
 */
export async function printTotemTicket(params: PrintTicketParams): Promise<void> {
  const url = getAgentUrl();
  const payload = {
    store: 'VIBE DRINKS',
    customerName: params.customerName,
    orderCode: params.orderCode,
    items: params.items,
    printedAt: new Date().toISOString(),
  };

  console.log('[printTotemLinux] iniciando impressão', {
    url,
    orderCode: params.orderCode,
    customerName: params.customerName,
    itemCount: params.items.length,
  });

  const ok = await postOnce(url, payload);
  if (!ok) {
    console.warn('[printTotemLinux] primeira tentativa falhou — retry em 800ms');
    await new Promise((r) => setTimeout(r, 800));
    await postOnce(url, payload);
  }
}
