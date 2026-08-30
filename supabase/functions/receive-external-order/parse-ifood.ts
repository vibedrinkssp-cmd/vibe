// ─────────────────────────────────────────────────────────────────────────────
// Parser de tickets iFood (texto bruto do Generic Text Driver)
// Estratégia: âncoras de seção, NÃO regex global. Cada bloco do ticket é
// localizado pelos seus marcadores fixos e parseado de forma determinística.
//
// Layout esperado (Generic Text Driver / Gestor Web iFood):
//
//   iFood / <Loja> / EXPEDICAO
//   ----------------------------------------
//        PEDIDO: #XXXX
//        Entrega Parceira | Entrega Propria
//        CODIGO DE COLETA PARCEIRA: XXXX
//   ----------------------------------------
//   Data: DD/MM/YYYY HH:MM:SS
//   Entrega prevista: HH:MM
//   Localizador: XXXX XXXX
//   N pedidos na sua loja
//   <Nome do Cliente>
//   0800 XXX XXXX ID: XXXXXXXX
//   Endereco: <rua>, <numero>
//   Comp: <complemento>
//   Bairro: <bairro>
//   Ref: <referencia>
//   Cidade: <cidade> - UF - CEP:
//   <CEP>
//   ----------------------------------------
//   ITENS DO PEDIDO (N)
//   Nx  <Nome do item>           R$ XX,XX
//       N <Modificador>           R$ XX,XX     ← N >= 1 = selecionado
//       0 <Modificador>           R$ 0,00      ← 0 = ignorar
//   ----------------------------------------
//   * Pagamento realizado *  |  * Cobrar do cliente *
//   <DETALHE DO PAGAMENTO>
//   ----------------------------------------
//   Valor total do pedido:        R$ XX,XX
//   Taxa de servico:               R$ X,XX
//   Taxa de entrega:               R$ X,XX
//   Pagamento via iFood:         -R$ XX,XX     ← se online
//   Cobrar do cliente:            R$ XX,XX
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedItem {
  quantity: number;
  product_name: string;
  unit_price: number;
  total_price: number;
  modifiers?: ParsedModifier[];
}

export interface ParsedModifier {
  quantity: number;
  name: string;
  price: number;
}

export interface ParsedAddress {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  reference: string;
  city: string;
  state: string;
  zip: string;
}

export interface ParsedPayment {
  method: string;          // 'pix' | 'card_credit' | 'card_debit' | 'cash' | 'online'
  raw_label: string;       // "Online - PIX - PIX" / "DINHEIRO" etc
  paid_online: boolean;    // true se "* Pagamento realizado *"
  change_for: number;      // Receber: R$ X
  amount_due: number;      // Cobrar do cliente: R$ X
}

export interface ParsedTotals {
  items_total: number;
  service_fee: number;
  delivery_fee: number;
  ifood_payment: number;
  customer_due: number;
  incentive_ifood: number;
  incentive_promo: number;
  discount_total: number;
}

export interface ParsedTicket {
  // metadata
  order_number: string;
  pickup_code: string;
  delivery_type: string;       // 'parceira' | 'propria' | ''
  store_name: string;
  order_date: string;          // DD/MM/YYYY HH:MM:SS
  scheduled_for: string;       // HH:MM
  locator: string;
  // customer
  customer_name: string;
  customer_phone: string;      // 0800 XXX XXXX
  customer_ifood_id: string;
  // address
  address: ParsedAddress;
  // items / payment / totals
  items: ParsedItem[];
  payment: ParsedPayment;
  totals: ParsedTotals;
  // legacy compatibility (campo único de itens)
  itens: ParsedItem[];
  // missing/validation
  missing_fields: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseCurrency(raw: string): number {
  if (!raw) return 0;
  const s = raw.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

function isDivider(line: string): boolean {
  return /^[-=]{4,}$/.test(line.trim());
}

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/g, '').trimEnd())  // preserva indent à esquerda
    .filter((l) => l.length > 0 && !/^Gestor Web/i.test(l));
}

// Encontra o índice da próxima linha que satisfaz o predicado, a partir de start
function findIndex(lines: string[], start: number, predicate: (l: string, i: number) => boolean): number {
  for (let i = start; i < lines.length; i += 1) {
    if (predicate(lines[i], i)) return i;
  }
  return -1;
}

// Pega linhas entre [from, to) ignorando divisores
function sliceSection(lines: string[], from: number, to: number): string[] {
  return lines.slice(from, to).filter((l) => !isDivider(l));
}

// ─── Section parsers ────────────────────────────────────────────────────────

function parseHeader(lines: string[]): {
  store_name: string;
  order_number: string;
  pickup_code: string;
  delivery_type: string;
} {
  const out = { store_name: '', order_number: '', pickup_code: '', delivery_type: '' };

  // Loja é a 2ª linha não-vazia (depois de "iFood")
  for (let i = 0; i < Math.min(8, lines.length); i += 1) {
    const t = lines[i].trim();
    if (/^iFood$/i.test(t)) {
      const next = (lines[i + 1] || '').trim();
      if (next && !/EXPEDICAO|EXPEDIÇÃO/i.test(next)) out.store_name = next;
      break;
    }
  }

  for (const line of lines) {
    const t = line.trim();
    const mPed = t.match(/^PEDIDO:\s*#?(\S+)/i);
    if (mPed && !out.order_number) out.order_number = mPed[1].replace(/^#/, '');
    const mCol = t.match(/^CODIGO\s+DE\s+COLETA(?:\s+PARCEIRA)?:\s*(\S+)/i);
    if (mCol && !out.pickup_code) out.pickup_code = mCol[1];
    if (/^Entrega\s+Parceira/i.test(t) && !out.delivery_type) out.delivery_type = 'parceira';
    if (/^Entrega\s+Pr[oó]pria/i.test(t) && !out.delivery_type) out.delivery_type = 'propria';
    if (/^ITENS\s+DO\s+PEDIDO/i.test(t)) break;
  }
  return out;
}

function parseMetaBlock(lines: string[]): {
  order_date: string;
  scheduled_for: string;
  locator: string;
} {
  const out = { order_date: '', scheduled_for: '', locator: '' };
  for (const line of lines) {
    const t = line.trim();
    const mData = t.match(/^Data:\s*(\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}(?::\d{2})?)/i);
    if (mData && !out.order_date) out.order_date = mData[1].trim();
    const mPrev = t.match(/^Entrega\s+prevista:\s*(.+)/i);
    if (mPrev && !out.scheduled_for) out.scheduled_for = mPrev[1].trim();
    const mLoc = t.match(/^Localizador:\s*(.+)/i);
    if (mLoc && !out.locator) out.locator = mLoc[1].trim();
    if (/^Endereco:|^ITENS\s+DO\s+PEDIDO/i.test(t)) break;
  }
  return out;
}

// Cliente: linha não-vazia ENTRE "N pedidos na sua loja" e a linha do telefone (0800 / ID)
// Fallback: se não achar pela âncora do telefone, varre entre "Localizador:" e "Endereco:".
function parseCustomer(lines: string[]): { name: string; phone: string; ifood_id: string } {
  const out = { name: '', phone: '', ifood_id: '' };

  const isNameLine = (t: string): boolean => {
    if (!t) return false;
    if (/[:0-9]/.test(t)) return false;
    if (/^primeiro\s+pedido/i.test(t)) return false;
    if (/^\d+\s+pedidos?\s+na\s+sua\s+loja/i.test(t)) return false;
    if (/^(entrega|expedicao|ifood|adega|gestor|cidade|bairro|comp|ref|endereco|pedido|data|valor|taxa|incentiv|pagamento|cobrar|online|cartao|cartão|cash|pix|dinheiro)/i.test(t)) return false;
    // 2+ palavras, só letras (com acentos), apóstrofo, hífen ou ponto
    return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'\-\.]{2,}$/.test(t) && /\s/.test(t.trim());
  };

  const phoneIdx = findIndex(lines, 0, (l) => /^\s*0800\s+\d/.test(l) || /\bID:\s*\d/.test(l));
  if (phoneIdx >= 0) {
    const phoneLine = lines[phoneIdx].trim();
    const mPhone = phoneLine.match(/^(0800\s+\d{3}\s+\d{4})/);
    if (mPhone) out.phone = mPhone[1];
    const mId = phoneLine.match(/ID:\s*(\d+)/i);
    if (mId) out.ifood_id = mId[1];

    // Nome: caminha pra trás procurando uma linha alfabética simples
    for (let j = phoneIdx - 1; j >= 0; j -= 1) {
      const t = lines[j].trim();
      if (!t) continue;
      if (isDivider(t)) break;
      if (isNameLine(t)) { out.name = t; break; }
    }
  }

  // Fallback: varre entre "Localizador:" e "Endereco:" (ou ITENS) procurando nome
  if (!out.name) {
    const locIdx = findIndex(lines, 0, (l) => /^Localizador:/i.test(l.trim()));
    const startIdx = locIdx >= 0 ? locIdx + 1 : 0;
    const endIdx = findIndex(lines, startIdx, (l) => /^Endereco:|^ITENS\s+DO\s+PEDIDO/i.test(l.trim()));
    const limit = endIdx > 0 ? endIdx : Math.min(lines.length, startIdx + 12);
    for (let j = startIdx; j < limit; j += 1) {
      const t = lines[j].trim();
      if (isNameLine(t)) { out.name = t; break; }
    }
  }

  return out;
}

function parseAddress(lines: string[]): ParsedAddress {
  const out: ParsedAddress = {
    street: '', number: '', complement: '', neighborhood: '',
    reference: '', city: '', state: '', zip: '',
  };

  const startIdx = findIndex(lines, 0, (l) => /^Endereco:/i.test(l.trim()));
  if (startIdx < 0) return out;

  const endIdx = findIndex(lines, startIdx + 1, (l) => isDivider(l) || /^ITENS\s+DO\s+PEDIDO/i.test(l.trim()));
  const block = lines.slice(startIdx, endIdx > 0 ? endIdx : lines.length);

  // Pass 1: agrupar continuações em buckets por âncora.
  // Linha sem prefixo de âncora vira continuação da âncora anterior.
  const ANCHOR_RE = /^(Endereco|Comp|Bairro|Ref|Cidade):\s*(.*)$/i;
  type Bucket = { key: string; value: string };
  const buckets: Bucket[] = [];
  for (const line of block) {
    const t = line.trim();
    if (!t || isDivider(t)) continue;
    const m = t.match(ANCHOR_RE);
    if (m) {
      buckets.push({ key: m[1].toLowerCase(), value: m[2].trim() });
    } else if (buckets.length > 0) {
      // continuação da âncora anterior
      const last = buckets[buckets.length - 1];
      last.value = `${last.value} ${t}`.replace(/\s+/g, ' ').trim();
    }
  }

  // Limpa "undefined" literal vindo do iFood
  const stripUndef = (s: string) => s.replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim();

  for (const b of buckets) {
    const v = stripUndef(b.value);
    switch (b.key) {
      case 'endereco': {
        // tenta separar "Rua X, 123" → rua / numero
        const mNum = v.match(/^(.+?),\s*(\d{1,5})(?:\s*[-,].*)?$/);
        if (mNum) {
          out.street = mNum[1].trim();
          out.number = mNum[2];
        } else {
          // número solto no fim sem vírgula? "Rua X 123"
          const mTail = v.match(/^(.+?)[\s,]+(\d{1,5})$/);
          if (mTail) {
            out.street = mTail[1].trim().replace(/,$/, '');
            out.number = mTail[2];
          } else {
            out.street = v.replace(/,\s*$/, '');
          }
        }
        break;
      }
      case 'comp': out.complement = v; break;
      case 'bairro': out.neighborhood = v; break;
      case 'ref': out.reference = v; break;
      case 'cidade': {
        // "Sao Jose dos Campos - SP - CEP: 12230081"
        const mUf = v.match(/^(.+?)\s*-\s*([A-Z]{2})\b/);
        if (mUf) {
          out.city = mUf[1].trim();
          out.state = mUf[2];
        } else {
          out.city = v.replace(/\s*-\s*CEP:?.*$/i, '').trim();
        }
        const mZ = v.match(/(\d{5}-?\d{3}|\d{8})/);
        if (mZ) out.zip = mZ[1].replace('-', '');
        break;
      }
    }
  }

  // Validação CEP (8 dígitos puros, descarta lixo)
  if (out.zip && !/^\d{8}$/.test(out.zip.replace('-', ''))) {
    out.zip = '';
  }

  return out;
}

function parseItems(lines: string[]): ParsedItem[] {
  const items: ParsedItem[] = [];
  const startIdx = findIndex(lines, 0, (l) => /^ITENS\s+DO\s+PEDIDO/i.test(l.trim()));
  if (startIdx < 0) return items;

  // Bloco de itens vai até o próximo divisor que precede um marcador de pagamento
  let endIdx = startIdx + 1;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    if (isDivider(lines[i])) {
      // Confirmar que é o divisor de fechamento dos itens (próxima linha não-divisor é pagamento)
      let next = i + 1;
      while (next < lines.length && isDivider(lines[next])) next += 1;
      if (next < lines.length && /(\*\s*Pagamento|\*\s*Cobrar|Valor\s+total)/i.test(lines[next])) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === startIdx + 1) endIdx = lines.length;

  let cur: ParsedItem | null = null;

  const pushCur = () => {
    if (cur) {
      // Garantia: total_price sempre coerente com unit_price × quantity
      if (cur.total_price <= 0 && cur.unit_price > 0) {
        cur.total_price = +(cur.unit_price * cur.quantity).toFixed(2);
      }
      // Recalcula unit_price a partir do total final (caso modificadores tenham somado)
      if (cur.quantity > 0) {
        cur.unit_price = +(cur.total_price / cur.quantity).toFixed(2);
      }
      items.push(cur);
    }
    cur = null;
  };

  for (let i = startIdx + 1; i < endIdx; i += 1) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || isDivider(t)) continue;

    // Linha de item principal: "Nx Nome   R$ XX,XX"
    // IMPORTANTE: no ticket iFood o valor é o TOTAL da linha (qty × unitário), não o unitário.
    const mItem = t.match(/^(\d+)x\s+(.+?)\s+R\$\s*([\d.,]+)\s*$/i);
    if (mItem) {
      pushCur();
      const qty = parseInt(mItem[1], 10);
      const lineTotal = parseCurrency(mItem[3]);
      cur = {
        quantity: qty,
        product_name: mItem[2].trim(),
        unit_price: qty > 0 ? +(lineTotal / qty).toFixed(2) : lineTotal,
        total_price: lineTotal,
        modifiers: [],
      };
      continue;
    }

    // Linha de item sem preço inline (raro): "Nx Nome..."
    const mItemNoPrice = t.match(/^(\d+)x\s+(.+)$/i);
    if (mItemNoPrice && !/R\$/.test(t) && (raw.match(/^\s*/)?.[0].length || 0) < 4) {
      pushCur();
      cur = {
        quantity: parseInt(mItemNoPrice[1], 10),
        product_name: mItemNoPrice[2].trim(),
        unit_price: 0,
        total_price: 0,
        modifiers: [],
      };
      continue;
    }

    // Modificador (linha indentada): "    N Nome   R$ X,XX"
    if (cur) {
      const mMod = t.match(/^(\d+)\s+(.+?)(?:\s+R\$\s*([\d.,]+))?\s*$/);
      if (mMod) {
        const qty = parseInt(mMod[1], 10);
        if (qty <= 0) continue;  // "0 X" = não selecionado, ignorar
        const modName = mMod[2].trim();
        const modPrice = mMod[3] ? parseCurrency(mMod[3]) : 0;
        cur.modifiers!.push({ quantity: qty, name: modName, price: modPrice });
        // Acrescenta ao nome do item para que o produto final descreva tudo
        cur.product_name = `${cur.product_name} + ${qty}x ${modName}`.trim();
        // Modificador soma ao total da linha (no ticket iFood o valor já é total)
        if (modPrice > 0) cur.total_price = +(cur.total_price + modPrice).toFixed(2);
        continue;
      }
      // Continuação de nome (ex: "100g" abaixo de "Salgadinho ...")
      if (!/^R\$/.test(t)) {
        cur.product_name = `${cur.product_name} ${t}`.trim();
      }
    }
  }
  pushCur();

  return items;
}

function parsePayment(lines: string[]): ParsedPayment {
  const out: ParsedPayment = {
    method: 'cash',
    raw_label: '',
    paid_online: false,
    change_for: 0,
    amount_due: 0,
  };

  const startIdx = findIndex(lines, 0, (l) => /\*\s*(Pagamento\s+realizado|Cobrar\s+do\s+cliente)\s*\*/i.test(l.trim()));
  if (startIdx < 0) return out;
  const endIdx = findIndex(lines, startIdx + 1, (l) => isDivider(l) || /^Valor\s+total/i.test(l.trim()));
  const block = lines.slice(startIdx, endIdx > 0 ? endIdx : Math.min(startIdx + 6, lines.length));

  for (const line of block) {
    const t = line.trim();
    if (/\*\s*Pagamento\s+realizado\s*\*/i.test(t)) out.paid_online = true;
    if (/\*\s*Cobrar\s+do\s+cliente\s*\*/i.test(t)) out.paid_online = false;

    const mReceber = t.match(/Receber:\s*R\$\s*([\d.,]+)/i);
    if (mReceber) out.change_for = parseCurrency(mReceber[1]);

    // Linha de método/canal — usa a primeira linha "útil" depois do marcador
    if (!out.raw_label && t && !/^\*/.test(t) && !/Receber:|Devolver:/i.test(t)) {
      out.raw_label = t;
    }
  }

  // Resolve método canônico
  const label = out.raw_label.toLowerCase();
  if (out.paid_online) {
    if (label.includes('pix')) out.method = 'pix';
    else if (label.includes('cred') || label.includes('créd')) out.method = 'card_credit';
    else if (label.includes('deb') || label.includes('déb')) out.method = 'card_debit';
    else out.method = 'pix';  // default p/ online
  } else {
    if (label.includes('pix')) out.method = 'pix';
    else if (label.includes('cred') || label.includes('créd')) out.method = 'card_credit';
    else if (label.includes('deb') || label.includes('déb')) out.method = 'card_debit';
    else out.method = 'cash';
  }
  return out;
}

function parseTotals(lines: string[]): ParsedTotals {
  const out: ParsedTotals = {
    items_total: 0, service_fee: 0, delivery_fee: 0,
    ifood_payment: 0, customer_due: 0,
    incentive_ifood: 0, incentive_promo: 0, discount_total: 0,
  };
  for (const line of lines) {
    const t = line.trim();
    const mItems = t.match(/^Valor\s+total\s+do\s+pedido:\s*R\$\s*([\d.,]+)/i);
    if (mItems) out.items_total = parseCurrency(mItems[1]);
    const mServ = t.match(/^Taxa\s+de\s+servico:\s*R\$\s*([\d.,]+)/i);
    if (mServ) out.service_fee = parseCurrency(mServ[1]);
    const mEnt = t.match(/^Taxa\s+de\s+entrega:\s*R\$\s*([\d.,]+)/i);
    if (mEnt) out.delivery_fee = parseCurrency(mEnt[1]);
    const mIf = t.match(/^Pagamento\s+via\s+iFood:\s*-?R\$\s*([\d.,]+)/i);
    if (mIf) out.ifood_payment = parseCurrency(mIf[1]);
    const mDue = t.match(/^Cobrar\s+do\s+cliente:\s*R\$\s*([\d.,]+)/i);
    if (mDue) out.customer_due = parseCurrency(mDue[1]);
    const mIncIf = t.match(/^Incentivos?\s+iFood\s*:?\s*-?R\$\s*([\d.,]+)/i);
    if (mIncIf) out.incentive_ifood = parseCurrency(mIncIf[1]);
    const mIncPr = t.match(/^Incentivos?\s+Promocionais?\s*:?\s*-?R\$\s*([\d.,]+)/i);
    if (mIncPr) out.incentive_promo = parseCurrency(mIncPr[1]);
  }
  out.discount_total = +(out.incentive_ifood + out.incentive_promo).toFixed(2);
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function parseIfoodTicket(rawText: string): ParsedTicket {
  // Remove bytes não imprimíveis remanescentes (defensivo)
  const cleaned = rawText
    .replace(/\x1b\x00/g, '')
    .replace(/\u0000/g, '')
    .replace(/[^\x20-\x7E\n\rÀ-ÿçÇãÃõÕáéíóúâêîôûàèìòùäëïöüÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÄËÏÖÜñÑ]/g, '');

  const lines = normalizeLines(cleaned);

  const header = parseHeader(lines);
  const meta = parseMetaBlock(lines);
  const customer = parseCustomer(lines);
  const address = parseAddress(lines);
  const items = parseItems(lines);
  const payment = parsePayment(lines);
  const totals = parseTotals(lines);

  // Validação mínima para não bloquear tickets reais por endereço parcial.
  const missing: string[] = [];
  if (!customer.name) missing.push('customer_name');
  if (!address.street) missing.push('address_street');
  if (!address.neighborhood) missing.push('address_neighborhood');
  if (items.length === 0) missing.push('items');

  return {
    order_number: header.order_number,
    pickup_code: header.pickup_code,
    delivery_type: header.delivery_type,
    store_name: header.store_name,
    order_date: meta.order_date,
    scheduled_for: meta.scheduled_for,
    locator: meta.locator,
    customer_name: customer.name,
    customer_phone: customer.phone,
    customer_ifood_id: customer.ifood_id,
    address,
    items,
    itens: items,  // alias legado
    payment,
    totals,
    missing_fields: missing,
  };
}

// ─── Adapter para o restante da edge function (mantém API compatível) ───────
export function ticketToStructuredBody(t: ParsedTicket): Record<string, unknown> {
  const normalizedAddressNumber = t.address.number || 'S/N';
  const addressMissingFields = t.missing_fields.filter((f) => f.startsWith('address_')).map((f) => f.replace('address_', ''));
  if (!t.address.number && !addressMissingFields.includes('number')) {
    addressMissingFields.push('number');
  }
  const fullAddress = [t.address.street, normalizedAddressNumber].filter(Boolean).join(', ');
  return {
    platform: 'ifood',
    order_number: t.order_number,
    customer_name: t.customer_name || 'Cliente iFood',
    phone: t.customer_phone,
    address_street: t.address.street,
    address_number: normalizedAddressNumber,
    address_complement: t.address.complement,
    address_neighborhood: t.address.neighborhood,
    address_reference: t.address.reference,
    address_city: t.address.city,
    address_cep: t.address.zip,
    address_incomplete: addressMissingFields.length > 0,
    address_missing_fields: addressMissingFields,
    address: fullAddress,
    store_name: t.store_name,
    order_date: t.order_date,
    delivery_estimate: t.scheduled_for,
    locator_code: t.locator,
    collection_code: t.pickup_code,
    delivery_type: t.delivery_type,
    payment_method: t.payment.raw_label || (t.payment.paid_online ? 'Online' : 'Dinheiro'),
    payment_status: t.payment.paid_online ? 'Pago' : '',
    service_fee: t.totals.service_fee.toFixed(2),
    delivery_fee_external: t.totals.delivery_fee.toFixed(2),
    total_ifood: t.totals.ifood_payment.toFixed(2),
    charge_customer: t.totals.customer_due.toFixed(2),
    discount_external: t.totals.discount_total.toFixed(2),
    incentive_ifood: t.totals.incentive_ifood.toFixed(2),
    incentive_promo: t.totals.incentive_promo.toFixed(2),
    subtotal_external: t.totals.items_total.toFixed(2),
    items: t.items.map((it) => ({
      quantity: it.quantity,
      product_name: it.product_name,
      unit_price: it.unit_price.toFixed(2),
      total_price: (it.total_price > 0 ? it.total_price : it.unit_price * it.quantity).toFixed(2),
    })),
  };
}
