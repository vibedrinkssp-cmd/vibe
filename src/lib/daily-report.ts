import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/shared/schema';
import { formatCurrency } from '@/lib/format-utils';

export interface DailyReport {
  totals: { orders: number; gross: number; items_revenue: number; cost: number; fees: number; profit: number };
  channels: { channel: string; orders: number; gross: number; fees: number; net: number; cost: number; profit: number }[];
  payments: { method: string; orders: number; total: number }[];
  top_products: { name: string; quantity: number; revenue: number }[];
  hourly: { hour: number; orders: number; gross: number }[];
  cancelled: number;
  sangrias: { type: string; total: number; count: number }[];
}

export const CHANNEL_LABELS: Record<string, string> = {
  balcao: 'Balcão (PDV)',
  delivery: 'Delivery (site)',
  ifood: 'iFood',
  '99food': '99Food',
  keeta: 'Keeta',
  rappi: 'Rappi',
};

export const channelLabel = (channel: string): string => CHANNEL_LABELS[channel] ?? channel;
export const paymentLabel = (method: string): string => PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;

/** Margem de lucro em % sobre o faturamento (0 quando não há venda). */
export const marginPercent = (profit: number, gross: number): string =>
  gross > 0 ? `${((profit / gross) * 100).toFixed(1)}%` : '-';

/** Resumo em texto puro, pronto para colar no WhatsApp. */
export function buildReportText(report: DailyReport, dateLabel: string): string {
  const { totals } = report;
  const lines = [
    `*RELATÓRIO DIÁRIO - VIBE DRINKS*`,
    dateLabel,
    '',
    `Pedidos: ${totals.orders} (cancelados: ${report.cancelled})`,
    `Faturamento: ${formatCurrency(totals.gross)}`,
    `Taxas de plataforma: ${formatCurrency(totals.fees)}`,
    `Custo dos produtos: ${formatCurrency(totals.cost)}`,
    `*Lucro real: ${formatCurrency(totals.profit)}* (${marginPercent(totals.profit, totals.gross)})`,
    '',
    '*Por canal*',
    ...report.channels.map(
      (c) => `${channelLabel(c.channel)}: ${formatCurrency(c.gross)} | taxa ${formatCurrency(c.fees)} | lucro ${formatCurrency(c.profit)}`,
    ),
    '',
    '*Pagamentos (balcão e delivery)*',
    ...report.payments.map((p) => `${paymentLabel(p.method)}: ${formatCurrency(p.total)} (${p.orders})`),
  ];
  if (report.sangrias.length > 0) {
    const total = report.sangrias.reduce((sum, s) => sum + Number(s.total), 0);
    lines.push('', `Sangrias: ${formatCurrency(total)}`);
  }
  lines.push('', '*Mais vendidos*', ...report.top_products.slice(0, 10).map((p) => `${p.quantity}x ${p.name}`));
  return lines.join('\n');
}

export function buildReportPdf(report: DailyReport, dateLabel: string): jsPDF {
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('Relatorio Diario - Vibe Drinks', 14, 20);
  doc.setFontSize(10);
  doc.text(dateLabel, 14, 27);

  const { totals } = report;
  autoTable(doc, {
    startY: 33,
    head: [['Resumo', 'Valor']],
    body: [
      ['Pedidos', String(totals.orders)],
      ['Cancelados', String(report.cancelled)],
      ['Faturamento', formatCurrency(totals.gross)],
      ['Taxas de plataforma', formatCurrency(totals.fees)],
      ['Custo dos produtos', formatCurrency(totals.cost)],
      ['Lucro real', `${formatCurrency(totals.profit)} (${marginPercent(totals.profit, totals.gross)})`],
    ],
  });
  autoTable(doc, {
    head: [['Canal', 'Pedidos', 'Bruto', 'Taxa', 'Liquido', 'Custo', 'Lucro']],
    body: report.channels.map((c) => [
      channelLabel(c.channel), String(c.orders), formatCurrency(c.gross), formatCurrency(c.fees),
      formatCurrency(c.net), formatCurrency(c.cost), formatCurrency(c.profit),
    ]),
  });
  autoTable(doc, {
    head: [['Pagamento (balcao/delivery)', 'Pedidos', 'Total']],
    body: report.payments.map((p) => [paymentLabel(p.method), String(p.orders), formatCurrency(p.total)]),
  });
  autoTable(doc, {
    head: [['Produto', 'Qtd', 'Faturamento']],
    body: report.top_products.map((p) => [p.name, String(p.quantity), formatCurrency(p.revenue)]),
  });
  return doc;
}
