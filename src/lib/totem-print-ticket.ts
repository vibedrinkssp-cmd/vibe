// Impressão silenciosa do ticket do totem.
// Para sair direto na impressora padrão do Windows sem diálogo, o navegador do
// totem (Chrome/Edge) precisa rodar com a flag --kiosk-printing. Quando essa flag
// está ativa, window.print() envia direto à impressora padrão.
//
// Como configurar no PC do totem (uma única vez):
//   1. Botão direito no atalho do Chrome > Propriedades.
//   2. No campo "Destino", adicione no final:  --kiosk-printing
//      Ex.: "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing
//   3. Defina a impressora térmica como impressora padrão do Windows.
//
// Sem essa flag, o Chrome ainda mostra o diálogo de impressão.
//
// IMPORTANTE: este módulo nunca lança exceção que impeça o fluxo do pedido.
// Toda falha de impressão é capturada e logada — o pedido já está salvo.

interface TicketItem {
  name: string;
  qty: number;
}

interface PrintTicketParams {
  customerName: string;
  orderCode: string;
  items: TicketItem[];
}

const FRAME_ID = "__totem_print_frame__";

function buildHtml({ customerName, orderCode, items }: PrintTicketParams): string {
  const today = new Date();
  const dateStr = today.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemsHtml = items
    .map(
      (it) => `
      <div class="row">
        <span class="qty">${it.qty}x</span>
        <span class="name">${escapeHtml(it.name)}</span>
      </div>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Ticket #${escapeHtml(orderCode)}</title>
<style>
  @page { size: 58mm auto; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Courier New', monospace; color: #000; background: #fff; }
  body { width: 54mm; padding: 2mm 1mm; font-size: 11pt; line-height: 1.25; }
  .center { text-align: center; }
  .bold { font-weight: 800; }
  .big { font-size: 13pt; font-weight: 800; }
  .huge { font-size: 18pt; font-weight: 900; letter-spacing: 1px; }
  .sep { border-top: 1px dashed #000; margin: 4px 0; }
  .row { display: flex; gap: 4px; margin: 2px 0; }
  .row .qty { font-weight: 800; min-width: 22px; }
  .row .name { flex: 1; word-break: break-word; }
  .small { font-size: 9pt; }
</style></head><body>
  <div class="center bold big">VM BRASIL</div>
  <div class="center small">${escapeHtml(dateStr)}</div>
  <div class="sep"></div>
  <div class="center huge">#${escapeHtml(orderCode)}</div>
  <div class="center bold">${escapeHtml(customerName.toUpperCase())}</div>
  <div class="sep"></div>
  ${itemsHtml}
  <div class="sep"></div>
  <div class="center small">Aguarde a chamada</div>
  <script>
    // Auto-print quando o documento carregar dentro do iframe.
    // Garantia extra de que window.print() acontece com o documento certo no foco.
    window.addEventListener('load', function () {
      try { window.focus(); window.print(); } catch (e) {}
    });
  </script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureFrame(): HTMLIFrameElement {
  let frame = document.getElementById(FRAME_ID) as HTMLIFrameElement | null;
  if (frame) {
    // Recria do zero a cada impressão para evitar resíduos do conteúdo anterior
    // (alguns drivers tem comportamento imprevisível ao reusar iframe).
    frame.remove();
  }
  frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  } as CSSStyleDeclaration);
  document.body.appendChild(frame);
  return frame;
}

/**
 * Imprime o ticket do totem.
 *
 * Estratégia robusta:
 *   1. Cria iframe novo a cada impressão (evita estado sujo do anterior).
 *   2. Usa srcdoc — funciona melhor no Chrome com kiosk-printing que doc.write.
 *   3. O HTML do ticket faz auto-print no load (window.print do próprio doc).
 *   4. Como fallback, também chamamos contentWindow.print() do lado de fora.
 *   5. Nunca lança erro: print é best-effort; o pedido já foi salvo.
 *
 * Retry: tenta 2 vezes com 800ms de intervalo se a primeira tentativa não
 * disparar window.print (ex.: iframe não carregou).
 */
export async function printTotemTicket(params: PrintTicketParams): Promise<void> {
  const html = buildHtml(params);

  const tryPrint = (): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      let printed = false;
      let frame: HTMLIFrameElement;
      try {
        frame = ensureFrame();
      } catch (e) {
        console.error("[printTotemTicket] erro criando iframe:", e);
        resolve(false);
        return;
      }

      const doPrint = () => {
        if (printed) return;
        printed = true;
        try {
          const win = frame.contentWindow;
          if (win) {
            win.focus();
            win.print();
            console.log("[printTotemTicket] window.print() chamado");
          } else {
            console.warn("[printTotemTicket] iframe sem contentWindow");
          }
        } catch (err) {
          console.error("[printTotemTicket] erro no print:", err);
        }
        // Resolve depois de dar tempo do spool pegar o conteúdo
        setTimeout(() => resolve(true), 500);
      };

      frame.onload = () => {
        // Pequeno delay para garantir que o CSS/render terminou
        setTimeout(doPrint, 100);
      };

      // Timeout duro: se onload não disparar em 1.5s, tenta print mesmo assim
      setTimeout(() => {
        if (!printed) {
          console.warn("[printTotemTicket] onload não disparou — forçando print");
          doPrint();
        }
      }, 1500);

      try {
        // srcdoc é mais confiável que doc.write no Chrome kiosk
        frame.srcdoc = html;
      } catch (e) {
        console.error("[printTotemTicket] erro ao setar srcdoc:", e);
        resolve(false);
      }
    });

  console.log("[printTotemTicket] iniciando impressão", {
    orderCode: params.orderCode,
    customerName: params.customerName,
    itemCount: params.items.length,
  });

  const ok = await tryPrint();
  if (!ok) {
    console.warn("[printTotemTicket] primeira tentativa falhou — retry em 800ms");
    await new Promise((r) => setTimeout(r, 800));
    await tryPrint();
  }
}
