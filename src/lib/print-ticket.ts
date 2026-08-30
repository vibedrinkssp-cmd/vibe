/**
 * Thermal Ticket Printer - Generates and prints a visual receipt
 * with emojis, icons, and high-contrast typography for thermal printers
 */

import type { Order, OrderItem, Address, Motoboy } from '@/shared/schema';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS, getSalespersonLabel } from '@/shared/schema';
import type { OrderStatus, PaymentMethod, OrderType } from '@/shared/schema';

interface OrderForPrint extends Order {
  items?: OrderItem[];
  userName?: string;
  userWhatsapp?: string;
  address?: Address;
  motoboy?: Motoboy;
}

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,3)} ${clean.slice(3,7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
  return phone;
}

function divider(style: 'heavy' | 'light' | 'dots' = 'light'): string {
  const map = {
    heavy: '<div class="divider heavy">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>',
    light: '<div class="divider light">─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>',
    dots: '<div class="divider dots">• • • • • • • • • • • • • • • • • •</div>',
  };
  return map[style];
}

function getPaymentEmoji(method: PaymentMethod): string {
  const map: Record<string, string> = {
    cash: '💵', pix: '📱', credit_card: '💳', debit_card: '💳',
  };
  return map[method] || '💰';
}

function getStatusEmoji(status: OrderStatus): string {
  const map: Record<string, string> = {
    pending: '🕐', accepted: '✅', preparing: '👨‍🍳', ready: '📦',
    dispatched: '🏍️', arrived: '📍', delivered: '🎉', cancelled: '❌',
  };
  return map[status] || '📋';
}

function getOrderTypeEmoji(type: OrderType): string {
  return type === 'delivery' ? '🛵' : '🏪';
}

export function printOrderTicket(order: OrderForPrint) {
  const orderId = order.id.slice(-6).toUpperCase();
  const status = order.status as OrderStatus;
  const paymentMethod = order.paymentMethod as PaymentMethod;
  const orderType = order.orderType as OrderType;
  const customerName = order.customerName || order.userName || 'Cliente';

  let t = '';

  // ══════ HEADER ══════
  t += `<div class="header">
    <div class="store-name">🍺 VIBE DRINKS 🍺</div>
    <div class="store-sub">Delivery de Bebidas</div>
  </div>`;

  t += divider('heavy');

  // ══════ ORDER NUMBER ══════
  t += `<div class="order-number">PEDIDO #${orderId}</div>`;
  t += `<div class="order-id">ID: ${order.id}</div>`;

  t += divider('heavy');

  // ══════ STATUS / TYPE / DATE ══════
  t += `<div class="info-grid">
    <div class="info-row">
      <span>${getStatusEmoji(status)} <b>Status:</b></span>
      <span class="badge">${ORDER_STATUS_LABELS[status]}</span>
    </div>
    <div class="info-row">
      <span>${getOrderTypeEmoji(orderType)} <b>Tipo:</b></span>
      <span>${ORDER_TYPE_LABELS[orderType]}</span>
    </div>
    <div class="info-row">
      <span>📅 <b>Data:</b></span>
      <span>${formatDate(order.createdAt)}</span>
    </div>
    ${order.salesperson ? `<div class="info-row">
      <span>🧑‍💼 <b>Vendedor:</b></span>
      <span>${getSalespersonLabel(order.salesperson)}</span>
    </div>` : ''}
  </div>`;

  t += divider('light');

  // ══════ CUSTOMER ══════
  t += `<div class="section-title">👤 CLIENTE</div>`;
  t += `<div class="info-grid">
    <div class="info-row">
      <span><b>Nome:</b></span>
      <span class="highlight">${customerName}</span>
    </div>
    ${order.userWhatsapp ? `<div class="info-row">
      <span>📞 <b>WhatsApp:</b></span>
      <span>${formatPhone(order.userWhatsapp)}</span>
    </div>` : ''}
  </div>`;

  // ══════ ADDRESS ══════
  if (orderType === 'delivery' && order.address) {
    t += divider('light');
    t += `<div class="section-title">📍 ENDEREÇO DE ENTREGA</div>`;
    t += `<div class="address-block">
      <div>🏠 ${order.address.street}, <b>${order.address.number}</b></div>
      ${order.address.complement ? `<div>↳ ${order.address.complement}</div>` : ''}
      <div>🏘️ ${order.address.neighborhood}</div>
      <div>🌆 ${order.address.city}/${order.address.state}</div>
      ${order.address.zipCode ? `<div>📮 CEP: ${order.address.zipCode}</div>` : ''}
    </div>`;
    if (order.address.notes) {
      t += `<div class="ref-box">📌 <b>Referência:</b> ${order.address.notes}</div>`;
    }
    if (order.deliveryDistance && Number(order.deliveryDistance) > 0) {
      t += `<div class="info-row" style="margin-top:4px;">
        <span>📏 <b>Distância:</b></span>
        <span>${Number(order.deliveryDistance).toFixed(1)} km</span>
      </div>`;
    }
  }

  // ══════ MOTOBOY ══════
  if (order.motoboy) {
    t += divider('light');
    t += `<div class="section-title">🏍️ MOTOBOY</div>`;
    t += `<div class="info-grid">
      <div class="info-row">
        <span><b>Nome:</b></span>
        <span class="highlight">${order.motoboy.name}</span>
      </div>
      ${order.motoboy.whatsapp ? `<div class="info-row">
        <span>📞 <b>Fone:</b></span>
        <span>${formatPhone(order.motoboy.whatsapp)}</span>
      </div>` : ''}
    </div>`;
  }

  // ══════ ITEMS ══════
  t += divider('heavy');
  t += `<div class="section-title">🛒 ITENS DO PEDIDO</div>`;

  t += `<div class="items-header">
    <span>QTD</span>
    <span>ITEM</span>
    <span>VALOR</span>
  </div>`;

  if (order.items && order.items.length > 0) {
    order.items.forEach((item, i) => {
      t += `<div class="item-row ${i % 2 === 0 ? 'even' : ''}">
        <span class="item-qty">${item.quantity}x</span>
        <span class="item-name">${item.productName}</span>
        <span class="item-price">${formatCurrency(item.totalPrice)}</span>
      </div>`;
      if (item.quantity > 1) {
        t += `<div class="item-unit">↳ unit: ${formatCurrency(item.unitPrice)}</div>`;
      }
    });
  } else {
    t += `<div style="text-align:center;padding:8px;color:#666;">Sem itens</div>`;
  }

  // ══════ TOTALS ══════
  t += divider('heavy');
  t += `<div class="section-title">💰 TOTAIS</div>`;

  t += `<div class="totals-grid">
    <div class="total-row">
      <span>Subtotal</span>
      <span>${formatCurrency(order.subtotal)}</span>
    </div>`;

  if (Number(order.discount || 0) > 0) {
    t += `<div class="total-row discount">
      <span>🏷️ Desconto</span>
      <span>-${formatCurrency(order.discount || 0)}</span>
    </div>`;
  }

  t += `<div class="total-row">
      <span>🚚 Taxa de Entrega${order.deliveryFeeAdjusted ? ' (ajust.)' : ''}</span>
      <span>${formatCurrency(order.deliveryFee)}</span>
    </div>`;

  if (order.originalDeliveryFee && order.deliveryFeeAdjusted) {
    t += `<div class="item-unit">↳ original: ${formatCurrency(order.originalDeliveryFee)}</div>`;
  }

  t += `</div>`;

  // Grand Total
  t += `<div class="grand-total">
    <span>🏆 TOTAL</span>
    <span>${formatCurrency(order.total)}</span>
  </div>`;

  // ══════ PAYMENT ══════
  t += `<div class="payment-box">
    ${getPaymentEmoji(paymentMethod)} <b>Pagamento:</b> ${PAYMENT_METHOD_LABELS[paymentMethod]}
  </div>`;

  if (paymentMethod === 'cash' && order.changeFor && Number(order.changeFor) > 0) {
    t += `<div class="change-box">
      <div>💵 <b>TROCO PARA:</b> ${formatCurrency(order.changeFor)}</div>
      <div class="change-return">↩️ <b>DEVOLVER:</b> ${formatCurrency(Number(order.changeFor) - Number(order.total))}</div>
    </div>`;
  }

  // ══════ NOTES ══════
  if (order.notes) {
    t += divider('light');
    t += `<div class="section-title">📝 OBSERVAÇÕES</div>`;
    t += `<div class="notes-box">${order.notes}</div>`;
  }

  // ══════ TIMELINE ══════
  t += divider('dots');
  t += `<div class="section-title">⏱️ HISTÓRICO</div>`;
  const timeline = [
    { emoji: '📥', label: 'Criado', date: order.createdAt },
    { emoji: '✅', label: 'Aceito', date: order.acceptedAt },
    { emoji: '👨‍🍳', label: 'Preparando', date: order.preparingAt },
    { emoji: '📦', label: 'Pronto', date: order.readyAt },
    { emoji: '🏍️', label: 'Despachado', date: order.dispatchedAt },
    { emoji: '📍', label: 'Chegou', date: order.arrivedAt },
    { emoji: '🎉', label: 'Entregue', date: order.deliveredAt },
  ];
  t += `<div class="timeline">`;
  timeline.forEach(step => {
    if (step.date) {
      t += `<div class="timeline-row">
        <span>${step.emoji} ${step.label}</span>
        <span>${formatDate(step.date)}</span>
      </div>`;
    }
  });
  t += `</div>`;

  // ══════ FOOTER ══════
  t += divider('heavy');
  t += `<div class="footer">
    <div>🙏 Obrigado pela preferência!</div>
    <div class="footer-sub">Vibe Drinks — ${new Date().toLocaleDateString('pt-BR')}</div>
  </div>`;

  // ══════ PRINT WINDOW ══════
  const printWindow = window.open('', '_blank', 'width=420,height=800');
  if (!printWindow) {
    alert('Permita pop-ups para imprimir o ticket.');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket #${orderId}</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Segoe UI', 'Arial', 'Helvetica', sans-serif;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 10px;
      color: #000;
      background: #fff;
      font-size: 14px;
      font-weight: 500;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    b, strong { font-weight: 900; }

    /* ─── Header ─── */
    .header { text-align: center; padding: 6px 0; }
    .store-name { font-size: 22px; font-weight: 900; letter-spacing: 1px; }
    .store-sub { font-size: 13px; color: #444; margin-top: 2px; }

    /* ─── Order number ─── */
    .order-number {
      text-align: center;
      font-size: 26px;
      font-weight: 900;
      padding: 8px 0 2px;
      letter-spacing: 2px;
    }
    .order-id {
      text-align: center;
      font-size: 9px;
      color: #888;
      word-break: break-all;
      margin-bottom: 4px;
    }

    /* ─── Dividers ─── */
    .divider {
      text-align: center;
      overflow: hidden;
      margin: 6px 0;
      font-size: 12px;
      letter-spacing: 1px;
    }
    .divider.heavy { font-weight: 900; color: #000; font-size: 10px; }
    .divider.light { color: #999; }
    .divider.dots { color: #bbb; font-size: 10px; }

    /* ─── Section title ─── */
    .section-title {
      font-size: 15px;
      font-weight: 900;
      margin: 8px 0 6px;
      text-transform: uppercase;
    }

    /* ─── Info grid ─── */
    .info-grid { margin: 4px 0; }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      padding: 2px 0;
    }
    .highlight { font-weight: 800; font-size: 15px; }
    .badge {
      display: inline-block;
      background: #000;
      color: #fff;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 700;
    }

    /* ─── Address ─── */
    .address-block {
      font-size: 14px;
      line-height: 1.6;
      padding: 4px 0;
    }
    .ref-box {
      font-size: 14px;
      margin: 4px 0;
      padding: 6px 8px;
      border: 2px dashed #555;
      border-radius: 4px;
      background: #f9f9f9;
    }

    /* ─── Items ─── */
    .items-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      border-bottom: 2px solid #000;
      padding: 4px 0;
      margin-bottom: 4px;
    }
    .items-header span:first-child { width: 35px; }
    .items-header span:nth-child(2) { flex: 1; }
    .items-header span:last-child { text-align: right; min-width: 70px; }

    .item-row {
      display: flex;
      align-items: baseline;
      padding: 4px 0;
      font-size: 15px;
      border-bottom: 1px dotted #ddd;
    }
    .item-row.even { background: #fafafa; }
    .item-qty { width: 35px; font-weight: 900; font-size: 16px; }
    .item-name { flex: 1; font-weight: 600; }
    .item-price { text-align: right; min-width: 70px; font-weight: 800; white-space: nowrap; }
    .item-unit { font-size: 12px; color: #666; padding-left: 40px; margin-bottom: 2px; }

    /* ─── Totals ─── */
    .totals-grid { margin: 4px 0; }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      padding: 3px 0;
    }
    .total-row.discount { color: #006600; font-weight: 700; }

    .grand-total {
      display: flex;
      justify-content: space-between;
      font-size: 22px;
      font-weight: 900;
      margin: 8px 0;
      padding: 8px 0;
      border-top: 3px solid #000;
      border-bottom: 3px solid #000;
    }

    /* ─── Payment ─── */
    .payment-box {
      font-size: 15px;
      font-weight: 700;
      padding: 6px 8px;
      margin: 6px 0;
      border: 2px solid #000;
      border-radius: 6px;
      text-align: center;
    }
    .change-box {
      font-size: 16px;
      font-weight: 900;
      padding: 8px;
      margin: 6px 0;
      border: 3px solid #000;
      border-radius: 6px;
      background: #f5f5f5;
      text-align: center;
    }
    .change-return { margin-top: 4px; font-size: 18px; }

    /* ─── Notes ─── */
    .notes-box {
      font-size: 14px;
      padding: 8px;
      border: 2px solid #333;
      border-radius: 6px;
      background: #fefce8;
      line-height: 1.5;
    }

    /* ─── Timeline ─── */
    .timeline { margin: 4px 0; }
    .timeline-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      padding: 2px 0;
      border-bottom: 1px dotted #eee;
    }

    /* ─── Footer ─── */
    .footer {
      text-align: center;
      padding: 10px 0 6px;
      font-size: 15px;
      font-weight: 700;
    }
    .footer-sub { font-size: 12px; color: #666; margin-top: 4px; font-weight: 500; }

    @media print {
      body { width: 80mm; padding: 6px; }
    }
  </style>
</head>
<body>
  ${t}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      }, 300);
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
}
