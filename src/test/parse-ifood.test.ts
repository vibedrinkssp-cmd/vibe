import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Importa o parser server-side. Roda sob Vite/Vitest (Node), não sob Deno.
import { parseIfoodTicket, ticketToStructuredBody } from
  '../../supabase/functions/receive-external-order/parse-ifood';

const FIXTURES = join(__dirname, '..', '..', 'supabase', 'functions', 'receive-external-order', '_fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

describe('parse-ifood — ticket1 (DINHEIRO + modificadores)', () => {
  const t = parseIfoodTicket(loadFixture('ticket1.prn'));

  it('extrai metadados do pedido', () => {
    expect(t.order_number).toBe('4289');
    expect(t.pickup_code).toBe('9691');
    expect(t.delivery_type).toBe('parceira');
    expect(t.locator).toBe('3548 2428');
    expect(t.order_date).toMatch(/18\/04\/2026 17:30/);
  });

  it('extrai cliente corretamente (sem confundir com loja)', () => {
    expect(t.customer_name).toBe('Yara Bellini');
    expect(t.customer_phone).toBe('0800 705 3040');
    expect(t.customer_ifood_id).toBe('35482428');
  });

  it('separa rua e número do endereço', () => {
    expect(t.address.street).toBe('R. Caio Madureira');
    expect(t.address.number).toBe('201');
    expect(t.address.neighborhood).toBe('Jardim Paulista');
    expect(t.address.complement).toContain('Casa de esquina');
    expect(t.address.city).toBe('Sao Jose dos Campos');
    expect(t.address.state).toBe('SP');
    expect(t.address.zip).toBe('12216200');
  });

  it('ignora modificadores com qty=0 e parseia 2 itens', () => {
    expect(t.items.length).toBe(2);
    const copao = t.items[0];
    expect(copao.quantity).toBe(1);
    expect(copao.product_name).toContain('Copao de batida');
    expect(copao.unit_price).toBe(38);
    // nenhum modificador (todos eram "0 X")
    expect(copao.modifiers?.length ?? 0).toBe(0);
    const salgado = t.items[1];
    expect(salgado.quantity).toBe(1);
    expect(salgado.product_name).toMatch(/Salgadinho/i);
    expect(salgado.unit_price).toBe(5.5);
  });

  it('detecta pagamento DINHEIRO com troco', () => {
    expect(t.payment.paid_online).toBe(false);
    expect(t.payment.method).toBe('cash');
    expect(t.payment.change_for).toBe(50);
  });

  it('extrai totais (cliente paga R$ 49,49)', () => {
    expect(t.totals.items_total).toBe(43.5);
    expect(t.totals.delivery_fee).toBe(4);
    expect(t.totals.customer_due).toBe(49.49);
  });

  it('está sem campos faltantes', () => {
    expect(t.missing_fields).toEqual([]);
  });
});

describe('parse-ifood — ticket2 (PIX online, 2 itens, taxa entrega)', () => {
  const t = parseIfoodTicket(loadFixture('ticket2.prn'));

  it('extrai cliente e endereço', () => {
    expect(t.order_number).toBe('1729');
    expect(t.customer_name).toBe('Nayara Bonifacio');
    expect(t.address.street).toBe('R. Sao Pedro');
    expect(t.address.number).toBe('87');
    expect(t.address.neighborhood).toBe('Vila Maria');
  });

  it('parseia itens (4x cerveja + 4x pirulito) com preço de LINHA (total)', () => {
    expect(t.items.length).toBe(2);
    // 4x Imperio Puro Malte 350ml — R$ 26,00 = TOTAL da linha (4 × 6,50)
    expect(t.items[0].quantity).toBe(4);
    expect(t.items[0].product_name).toMatch(/Imperio Puro Malte/i);
    expect(t.items[0].total_price).toBe(26);
    expect(t.items[0].unit_price).toBe(6.5);
    // 4x Pirulito Big Big — R$ 4,00 = TOTAL (4 × 1,00)
    expect(t.items[1].quantity).toBe(4);
    expect(t.items[1].product_name).toMatch(/Pirulito Big Big/i);
    expect(t.items[1].total_price).toBe(4);
    expect(t.items[1].unit_price).toBe(1);
    // Soma dos itens deve bater com items_total do ticket (R$ 30,00)
    const sum = t.items.reduce((acc, it) => acc + it.total_price, 0);
    expect(sum).toBe(30);
    expect(t.totals.items_total).toBe(30);
  });

  it('marca pagamento como PIX online (já pago)', () => {
    expect(t.payment.paid_online).toBe(true);
    expect(t.payment.method).toBe('pix');
    expect(t.totals.customer_due).toBe(0);
    expect(t.totals.ifood_payment).toBe(34.99);
  });
});

describe('parse-ifood — ticket3 (idêntico ao 2 — base para dedup)', () => {
  it('produz mesmos campos canônicos do ticket2', () => {
    const a = parseIfoodTicket(loadFixture('ticket2.prn'));
    const b = parseIfoodTicket(loadFixture('ticket3.prn'));
    expect(a.order_number).toBe(b.order_number);
    expect(a.customer_name).toBe(b.customer_name);
    expect(a.totals.customer_due).toBe(b.totals.customer_due);
    // mesmo número de pedido + mesma data → dedup deve disparar no servidor
  });
});

describe('parse-ifood — ticket4 (CRÉDITO online, item com modificadores)', () => {
  const t = parseIfoodTicket(loadFixture('ticket4.prn'));

  it('extrai metadados', () => {
    expect(t.order_number).toBe('0671');
    expect(t.customer_name).toBe('Vitor Midorikawa');
  });

  it('parseia 1 item com 3 modificadores selecionados', () => {
    expect(t.items.length).toBe(1);
    const drink = t.items[0];
    expect(drink.quantity).toBe(1);
    expect(drink.product_name).toMatch(/Copao de Gin/i);
    expect(drink.product_name).toMatch(/Energetico/i);
    expect(drink.product_name).toMatch(/Intencion/i);
    expect(drink.modifiers!.length).toBe(3);
    // valores: 5 (energetico) + 0 (gelo) + 20 (intencion) somam ao unit
    expect(drink.unit_price).toBe(50);  // 25 + 5 + 0 + 20
  });

  it('marca pagamento como CRÉDITO online', () => {
    expect(t.payment.paid_online).toBe(true);
    expect(t.payment.method).toBe('card_credit');
  });
});

describe('ticketToStructuredBody — adapter para edge function', () => {
  it('produz payload completo compatível com o fluxo legado', () => {
    const t = parseIfoodTicket(loadFixture('ticket1.prn'));
    const body = ticketToStructuredBody(t);
    expect(body.platform).toBe('ifood');
    expect(body.customer_name).toBe('Yara Bellini');
    expect(body.address_street).toBe('R. Caio Madureira');
    expect(body.address_number).toBe('201');
    expect((body.items as any[]).length).toBe(2);
    expect(body.charge_customer).toBe('49.49');
  });

  it('normaliza endereço sem número para S/N sem bloquear o ticket', () => {
    const raw = [
      'iFood',
      'VM BRASIL',
      'EXPEDICAO',
      '----------------------------------------',
      'PEDIDO: #9999',
      'Entrega Parceira',
      '----------------------------------------',
      'Data: 20/04/2026 00:10:00',
      'Entrega prevista: 00:30',
      'Localizador: 1234 5678',
      '1 pedidos na sua loja',
      'Cliente Teste',
      '0800 123 4567 ID: 12345678',
      'Endereco: Rua Sem Numero',
      'Bairro: Centro',
      'Cidade: Sao Jose dos Campos - SP - CEP:',
      '12210030',
      '----------------------------------------',
      'ITENS DO PEDIDO (1)',
      '1x Coca Cola 350ml R$ 7,00',
      '----------------------------------------',
      '* Cobrar do cliente *',
      'DINHEIRO',
      '----------------------------------------',
      'Valor total do pedido: R$ 7,00',
      'Taxa de entrega: R$ 3,00',
      'Cobrar do cliente: R$ 10,00',
    ].join('\n');

    const ticket = parseIfoodTicket(raw);
    const body = ticketToStructuredBody(ticket);

    expect(ticket.missing_fields).not.toContain('address_number');
    expect(body.address_number).toBe('S/N');
    expect(body.address_incomplete).toBe(true);
  });
});

describe('parse-ifood — regressões .prn reais (8/05)', () => {
  it('Julio: número da rua quebrado em outra linha + CEP undefined + incentivos', () => {
    const t = parseIfoodTicket(loadFixture('ticket_julio.prn'));
    expect(t.customer_name).toBe('Julio Do Nascimento');
    expect(t.address.street).toMatch(/Mario Sampaio Martins/);
    expect(t.address.number).toBe('404');
    expect(t.address.zip).toBe('');                 // "undefined" virou vazio
    expect(t.totals.incentive_ifood).toBe(20);
    expect(t.totals.incentive_promo).toBe(5.5);
    expect(t.totals.discount_total).toBe(25.5);
    expect(t.payment.paid_online).toBe(true);
    expect(t.payment.method).toBe('pix');

    const body = ticketToStructuredBody(t);
    expect(body.address_number).toBe('404');
    expect(body.discount_external).toBe('25.50');
  });

  it('Darla: rua quebrada em duas linhas + número no fim', () => {
    const t = parseIfoodTicket(loadFixture('ticket_darla.prn'));
    expect(t.customer_name).toBe('Darla Diane Mota Goncalves');
    expect(t.address.street).toMatch(/Brasilino de Paula Ferreira/);
    expect(t.address.number).toBe('460');
    expect(t.address.neighborhood).toBe('Vila Candida');
    expect(t.payment.paid_online).toBe(true);
  });

  it('Caique: cobrar do cliente após desconto', () => {
    const t = parseIfoodTicket(loadFixture('ticket_caique.prn'));
    expect(t.customer_name).toBe('Caique Oliveira');
    expect(t.totals.incentive_ifood).toBe(20);
    expect(t.totals.customer_due).toBe(13.99);
    expect(t.payment.paid_online).toBe(false);
  });
});
