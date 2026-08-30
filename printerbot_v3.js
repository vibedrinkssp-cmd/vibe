// ─────────────────────────────────────────────────────────────────────────────
// VM BRASIL — Printer Bot v3.0 (THIN CLIENT)
//
// MUDANÇA RADICAL vs v2.5.2:
//   • REMOVIDO ~400 linhas de regex/extração — agora rodam server-side na edge
//     function `receive-external-order`. Manutenção centralizada: fix de regex
//     não exige reinstalar o bot na máquina da loja.
//   • Bot só faz: monitora pasta → lê .prn → limpa bytes de impressora →
//     calcula MD5 → envia raw_text → arquiva resposta.
//   • Dedup local por hash MD5 (TTL 30min) preservada — evita reenviar mesmo
//     arquivo se servidor já confirmou recentemente.
//
// Requisitos: Node.js 18+ (fetch nativo). pdfkit é OPCIONAL.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG = {
  pastaMonitorada: process.env.PRN_WATCH_DIR || 'C:\\Users\\VMBrasil\\Documents',
  pastaEnviados: '_enviados',
  pastaErro: '_erro',
  intervaloMs: 2000,
  platform: 'ifood',
  apiUrl:
    process.env.EXTERNAL_ORDER_URL ||
    'https://djkonftjquielnqejwht.supabase.co/functions/v1/receive-external-order',
  apiKey: process.env.EXTERNAL_ORDER_API_KEY || 't9W3CU6J@xR4u52',
  dedupTtlMs: 30 * 60 * 1000, // 30min
};

function garantirPastas() {
  const enviados = path.join(CONFIG.pastaMonitorada, CONFIG.pastaEnviados);
  const erro = path.join(CONFIG.pastaMonitorada, CONFIG.pastaErro);
  if (!fs.existsSync(enviados)) fs.mkdirSync(enviados, { recursive: true });
  if (!fs.existsSync(erro)) fs.mkdirSync(erro, { recursive: true });
}

function md5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// Limpa bytes de controle/escape de impressora térmica antes de enviar.
// O servidor também limpa de novo (defensive), mas mandar texto limpo
// economiza banda e evita logs poluídos.
function limparTexto(buffer) {
  return buffer
    .toString('utf8')
    .replace(/\x1b\x00/g, '')
    .replace(/\u0000/g, '')
    .replace(/[^\x20-\x7E\n\rÀ-ÿçÇãÃõÕáéíóúâêîôûàèìòùäëïöüÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÄËÏÖÜñÑ]/g, '');
}

async function enviarRawText(rawText, contentHash, sourceFilename) {
  if (!CONFIG.apiKey || CONFIG.apiKey === 'COLE_AQUI_A_MESMA_CHAVE_DA_SECRET') {
    throw new Error('Configure EXTERNAL_ORDER_API_KEY (mesma chave da secret).');
  }
  if (typeof fetch !== 'function') {
    throw new Error('Node.js 18+ é necessário (fetch nativo).');
  }
  const payload = {
    platform: CONFIG.platform,
    raw_text: rawText,
    content_hash: contentHash,
    source_filename: sourceFilename,
  };
  const response = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CONFIG.apiKey },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body;
}

function moverArquivo(origem, pastaDestino) {
  if (!fs.existsSync(origem)) return null;
  const info = path.parse(origem);
  const destino = path.join(CONFIG.pastaMonitorada, pastaDestino, `${info.name}_${Date.now()}${info.ext}`);
  try {
    fs.renameSync(origem, destino);
    return destino;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function salvarJsonResumo(arquivoBase, dados) {
  fs.writeFileSync(`${arquivoBase}.json`, JSON.stringify(dados, null, 2), 'utf8');
}

async function processarArquivo(arquivo, hashCache) {
  const raw = fs.readFileSync(arquivo);
  const contentHash = md5(raw);
  const nomeBase = path.basename(arquivo);

  // Dedup local por hash do conteúdo (não por nome de arquivo!)
  const cached = hashCache.get(contentHash);
  if (cached && (Date.now() - cached) < CONFIG.dedupTtlMs) {
    console.log(`[DEDUP LOCAL] ${nomeBase} hash=${contentHash.substring(0, 8)} já enviado há ${Math.round((Date.now() - cached) / 1000)}s — pulando`);
    moverArquivo(arquivo, CONFIG.pastaEnviados);
    return;
  }

  const rawText = limparTexto(raw);
  console.log(`[ENVIANDO] ${nomeBase} hash=${contentHash.substring(0, 8)} bytes=${rawText.length}`);

  const resposta = await enviarRawText(rawText, contentHash, nomeBase);
  hashCache.set(contentHash, Date.now());

  const destino = moverArquivo(arquivo, CONFIG.pastaEnviados);
  if (destino) {
    const baseResumo = destino.replace(/\.prn$/i, '');
    try {
      salvarJsonResumo(baseResumo, {
        enviadoEm: new Date().toISOString(),
        contentHash,
        sourceFilename: nomeBase,
        resposta,
      });
    } catch (err) {
      console.warn(`[salvar JSON] ${err.message}`);
    }
  }

  const dup = resposta.duplicate ? ' DUPLICATA' : '';
  const dedupBy = resposta.dedup_by ? ` (via ${resposta.dedup_by})` : '';
  console.log(`[OK] order_id=${resposta.order_id}${dup}${dedupBy} items=${resposta.item_count ?? '?'} addressComplete=${resposta.addressComplete ?? '?'}`);
  if (resposta.missingFields && resposta.missingFields.length > 0) {
    console.log(`⚠️  Endereço incompleto — faltando: ${resposta.missingFields.join(', ')}`);
  }
}

function registrarErro(arquivo, erro) {
  const destino = moverArquivo(arquivo, CONFIG.pastaErro);
  if (!destino) return;
  try {
    salvarJsonResumo(destino.replace(/\.prn$/i, ''), {
      erroEm: new Date().toISOString(),
      mensagem: erro.message,
      stack: erro.stack,
    });
  } catch {}
}

function monitorarPasta(pasta) {
  garantirPastas();
  console.log(`[printerbot v3.0 THIN] Monitorando: ${pasta}`);
  console.log(`[printerbot v3.0 THIN] Endpoint: ${CONFIG.apiUrl}`);
  console.log(`[printerbot v3.0 THIN] Toda extração agora roda no servidor.`);

  const emProcessamento = new Set();
  const hashCache = new Map();

  setInterval(() => {
    const agora = Date.now();
    for (const [hash, ts] of hashCache.entries()) {
      if ((agora - ts) > CONFIG.dedupTtlMs) hashCache.delete(hash);
    }
  }, 5 * 60 * 1000);

  setInterval(async () => {
    try {
      const arquivos = fs.readdirSync(pasta).filter((n) => n.toLowerCase().endsWith('.prn'));
      for (const nome of arquivos) {
        const arquivo = path.join(pasta, nome);
        if (emProcessamento.has(arquivo)) continue;
        if (!fs.existsSync(arquivo)) continue;
        emProcessamento.add(arquivo);
        try {
          await processarArquivo(arquivo, hashCache);
        } catch (erro) {
          console.error(`Erro em ${nome}: ${erro.message}`);
          try { registrarErro(arquivo, erro); }
          catch (e) { console.error('Erro ao mover:', e.message); }
        } finally {
          emProcessamento.delete(arquivo);
        }
      }
    } catch (erro) {
      console.error('Erro no monitoramento:', erro.message);
    }
  }, CONFIG.intervaloMs);
}

monitorarPasta(CONFIG.pastaMonitorada);
