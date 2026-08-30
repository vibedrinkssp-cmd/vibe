import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

const tools = [
  {
    type: "function",
    function: {
      name: "query_orders",
      description: "Busca pedidos com filtros de data, status e tipo. Use para perguntas sobre vendas, pedidos, faturamento.",
      parameters: {
        type: "object",
        properties: {
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD" },
          status: { type: "string", description: "Status: pending, accepted, preparing, ready, dispatched, arrived, delivered, cancelled" },
          order_type: { type: "string", description: "Tipo: counter, delivery, pickup, totem" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_products",
      description: "Busca produtos, estoque e categorias.",
      parameters: {
        type: "object",
        properties: {
          low_stock: { type: "boolean", description: "Se true, retorna produtos com estoque < 5" },
          category_name: { type: "string", description: "Nome da categoria para filtrar" },
          search: { type: "string", description: "Termo para buscar no nome do produto" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_sales_summary",
      description: "Resumo de vendas por período: total, por método de pagamento, por tipo de pedido.",
      parameters: {
        type: "object",
        properties: {
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD" },
        },
        required: ["date_start", "date_end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_customers",
      description: "Busca clientes e histórico de compras.",
      parameters: {
        type: "object",
        properties: {
          search: { type: "string", description: "Nome ou WhatsApp do cliente" },
          top_buyers: { type: "boolean", description: "Se true, retorna top compradores" },
          limit: { type: "number", description: "Quantidade máxima de resultados" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_motoboys",
      description: "Status e entregas dos motoboys.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data YYYY-MM-DD" },
          active_only: { type: "boolean", description: "Se true, apenas motoboys ativos" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_cash_register",
      description: "Situação do caixa, sangrias, suprimentos e fechamentos.",
      parameters: {
        type: "object",
        properties: {
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD" },
          include_sangrias: { type: "boolean", description: "Se true, inclui lista de sangrias" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_coupons",
      description: "Cupons ativos e utilizados.",
      parameters: {
        type: "object",
        properties: {
          active_only: { type: "boolean", description: "Se true, apenas cupons ativos" },
          used_only: { type: "boolean", description: "Se true, apenas cupons já utilizados" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_order_items",
      description: "Itens vendidos para análise de produtos mais vendidos.",
      parameters: {
        type: "object",
        properties: {
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD" },
          top_products: { type: "boolean", description: "Se true, agrupa por produto e ordena por quantidade" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_caderneta",
      description: "Clientes da caderneta (fiado), saldos pendentes, entradas e pagamentos.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "Nome do cliente para filtrar" },
          pending_only: { type: "boolean", description: "Se true, retorna apenas clientes com saldo devedor" },
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD para filtrar entradas" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD para filtrar entradas" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_open_bottles",
      description: "Garrafas abertas no bar, doses restantes e consumo.",
      parameters: {
        type: "object",
        properties: {
          include_empty: { type: "boolean", description: "Se true, inclui garrafas vazias" },
          search: { type: "string", description: "Nome do produto para filtrar" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_employees",
      description: "Lista de funcionários ativos e inativos.",
      parameters: {
        type: "object",
        properties: {
          active_only: { type: "boolean", description: "Se true, apenas funcionários ativos" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_platform_sales",
      description: "Vendas em plataformas externas (iFood, Rappi, etc).",
      parameters: {
        type: "object",
        properties: {
          date_start: { type: "string", description: "Data inicial YYYY-MM-DD" },
          date_end: { type: "string", description: "Data final YYYY-MM-DD" },
          platform: { type: "string", description: "Nome da plataforma para filtrar" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_categories",
      description: "Categorias de produtos cadastradas.",
      parameters: {
        type: "object",
        properties: {
          active_only: { type: "boolean", description: "Se true, apenas categorias ativas" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_settings",
      description: "Configurações da loja: endereço, horário de funcionamento, taxa de entrega, chave PIX.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "query_special_drinks",
      description: "Configurações de bebidas especiais (drinks montáveis), frutas disponíveis e receitas.",
      parameters: {
        type: "object",
        properties: {
          include_recipes: { type: "boolean", description: "Se true, inclui receitas dos drinks" },
          include_fruits: { type: "boolean", description: "Se true, inclui frutas disponíveis" },
        },
      },
    },
  },
];

// Tool execution functions
async function executeQueryOrders(supabase: any, params: any) {
  let query = supabase.from('orders').select('*');
  if (params.date_start) query = query.gte('created_at', `${params.date_start}T00:00:00`);
  if (params.date_end) query = query.lte('created_at', `${params.date_end}T23:59:59`);
  if (params.status) query = query.eq('status', params.status);
  if (params.order_type) query = query.eq('order_type', params.order_type);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;

  return {
    total_orders: data.length,
    total_value: data.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
    by_status: data.reduce((a: any, o: any) => { a[o.status] = (a[o.status] || 0) + 1; return a; }, {}),
    by_payment: data.reduce((a: any, o: any) => { a[o.payment_method] = (a[o.payment_method] || 0) + Number(o.total || 0); return a; }, {}),
    by_type: data.reduce((a: any, o: any) => { a[o.order_type] = (a[o.order_type] || 0) + 1; return a; }, {}),
    orders: data.slice(0, 10),
  };
}

async function executeQueryProducts(supabase: any, params: any) {
  let query = supabase.from('products').select('*, categories(name)');
  if (params.low_stock) query = query.lt('stock', 5);
  if (params.search) query = query.ilike('name', `%${params.search}%`);

  const { data, error } = await query.order('stock', { ascending: true }).limit(200);
  if (error) throw error;

  let filtered = data;
  if (params.category_name) {
    filtered = data.filter((p: any) => p.categories?.name?.toLowerCase().includes(params.category_name.toLowerCase()));
  }

  return {
    total_products: filtered.length,
    low_stock_count: filtered.filter((p: any) => p.stock < 5).length,
    out_of_stock: filtered.filter((p: any) => p.stock === 0).length,
    products: filtered.slice(0, 50).map((p: any) => ({
      name: p.name, stock: p.stock, price: p.sale_price, cost: p.cost_price,
      category: p.categories?.name, is_active: p.is_active, tier: p.tier,
    })),
  };
}

async function executeQuerySalesSummary(supabase: any, params: any) {
  const { data, error } = await supabase
    .from('orders')
    .select('total, subtotal, delivery_fee, discount, payment_method, order_type, status')
    .gte('created_at', `${params.date_start}T00:00:00`)
    .lte('created_at', `${params.date_end}T23:59:59`)
    .not('status', 'eq', 'cancelled')
    .limit(1000);
  if (error) throw error;

  const delivered = data.filter((o: any) => o.status === 'delivered');
  return {
    total_orders: data.length,
    delivered_orders: delivered.length,
    total_revenue: data.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
    delivered_revenue: delivered.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
    total_delivery_fees: data.reduce((s: number, o: any) => s + Number(o.delivery_fee || 0), 0),
    total_discounts: data.reduce((s: number, o: any) => s + Number(o.discount || 0), 0),
    by_payment_method: data.reduce((a: any, o: any) => { a[o.payment_method] = (a[o.payment_method] || 0) + Number(o.total || 0); return a; }, {}),
    by_order_type: data.reduce((a: any, o: any) => { a[o.order_type] = (a[o.order_type] || 0) + Number(o.total || 0); return a; }, {}),
  };
}

async function executeQueryCustomers(supabase: any, params: any) {
  if (params.top_buyers) {
    const { data: orders, error } = await supabase
      .from('orders').select('user_id, total, customer_name')
      .not('status', 'eq', 'cancelled').limit(1000);
    if (error) throw error;

    const userTotals = orders.reduce((a: any, o: any) => {
      const key = o.user_id || o.customer_name || 'Anônimo';
      if (!a[key]) a[key] = { id: key, name: o.customer_name || 'Cliente', total: 0, orders: 0 };
      a[key].total += Number(o.total || 0);
      a[key].orders += 1;
      return a;
    }, {});

    return { top_customers: Object.values(userTotals).sort((a: any, b: any) => b.total - a.total).slice(0, params.limit || 10) };
  }

  let query = supabase.from('users').select('id, name, whatsapp, created_at');
  if (params.search) query = query.or(`name.ilike.%${params.search}%,whatsapp.ilike.%${params.search}%`);
  const { data, error } = await query.limit(params.limit || 20);
  if (error) throw error;
  return { customers: data };
}

async function executeQueryMotoboys(supabase: any, params: any) {
  let query = supabase.from('motoboys').select('*');
  if (params.active_only) query = query.eq('is_active', true);
  const { data: motoboys, error: mbError } = await query;
  if (mbError) throw mbError;

  if (params.date) {
    const { data: orders, error: ordersError } = await supabase
      .from('orders').select('motoboy_id, status')
      .eq('order_type', 'delivery')
      .gte('created_at', `${params.date}T00:00:00`)
      .lte('created_at', `${params.date}T23:59:59`);
    if (ordersError) throw ordersError;

    const stats = orders.reduce((a: any, o: any) => {
      if (o.motoboy_id) {
        if (!a[o.motoboy_id]) a[o.motoboy_id] = { total: 0, delivered: 0 };
        a[o.motoboy_id].total += 1;
        if (o.status === 'delivered') a[o.motoboy_id].delivered += 1;
      }
      return a;
    }, {});

    return { motoboys: motoboys.map((m: any) => ({ ...m, deliveries_today: stats[m.id]?.total || 0, delivered_today: stats[m.id]?.delivered || 0 })) };
  }

  return { motoboys };
}

async function executeQueryCashRegister(supabase: any, params: any) {
  const { data: session } = await supabase.from('cash_register_sessions').select('*').eq('status', 'open').maybeSingle();
  const result: any = {
    current_session: session ? { is_open: true, opening_balance: session.opening_balance, current_balance: session.current_balance, opened_at: session.opened_at, opened_by: session.opened_by, cash_supplies: session.cash_supplies } : { is_open: false },
  };

  if (params.include_sangrias && params.date_start && params.date_end) {
    const { data: sangrias } = await supabase.from('sangrias').select('*').gte('created_at', `${params.date_start}T00:00:00`).lte('created_at', `${params.date_end}T23:59:59`);
    result.sangrias = { total: (sangrias || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0), count: (sangrias || []).length, items: sangrias || [] };
  }

  if (params.date_start && params.date_end) {
    const { data: closures } = await supabase.from('cash_register_closures').select('*').gte('closed_at', `${params.date_start}T00:00:00`).lte('closed_at', `${params.date_end}T23:59:59`);
    result.closures = closures || [];
  }

  return result;
}

async function executeQueryCoupons(supabase: any, params: any) {
  let query = supabase.from('coupons').select('*');
  if (params.active_only) query = query.eq('is_active', true);
  const { data: coupons, error } = await query;
  if (error) throw error;

  const { data: usages } = await supabase.from('user_coupons').select('coupon_id, is_used');
  const usageStats = (usages || []).reduce((a: any, u: any) => {
    if (!a[u.coupon_id]) a[u.coupon_id] = { assigned: 0, used: 0 };
    a[u.coupon_id].assigned += 1;
    if (u.is_used) a[u.coupon_id].used += 1;
    return a;
  }, {});

  return {
    coupons: coupons.map((c: any) => ({ code: c.code, discount_percent: c.discount_percent, is_active: c.is_active, assigned_count: usageStats[c.id]?.assigned || 0, used_count: usageStats[c.id]?.used || 0 })),
    total_coupons: coupons.length,
    active_coupons: coupons.filter((c: any) => c.is_active).length,
  };
}

async function executeQueryOrderItems(supabase: any, params: any) {
  let query = supabase.from('order_items').select('*, orders!inner(created_at, status)');
  if (params.date_start) query = query.gte('orders.created_at', `${params.date_start}T00:00:00`);
  if (params.date_end) query = query.lte('orders.created_at', `${params.date_end}T23:59:59`);
  const { data, error } = await query.limit(1000);
  if (error) throw error;

  const validItems = data.filter((i: any) => i.orders?.status !== 'cancelled');

  if (params.top_products) {
    const productStats = validItems.reduce((a: any, i: any) => {
      const key = i.product_name;
      if (!a[key]) a[key] = { name: key, quantity: 0, revenue: 0 };
      a[key].quantity += i.quantity;
      a[key].revenue += Number(i.total_price || 0);
      return a;
    }, {});
    return { top_products: Object.values(productStats).sort((a: any, b: any) => (b as any).quantity - (a as any).quantity).slice(0, 20) };
  }

  return {
    total_items: validItems.length,
    total_quantity: validItems.reduce((s: number, i: any) => s + i.quantity, 0),
    total_revenue: validItems.reduce((s: number, i: any) => s + Number(i.total_price || 0), 0),
  };
}

// NEW TOOLS

async function executeQueryCaderneta(supabase: any, params: any) {
  const { data: customers } = await supabase.from('caderneta_customers').select('*').order('name');
  const { data: entries } = await supabase.from('caderneta_entries').select('*').order('created_at', { ascending: false }).limit(1000);
  const { data: payments } = await supabase.from('caderneta_payments').select('*').order('created_at', { ascending: false }).limit(1000);

  let filteredEntries = entries || [];
  let filteredPayments = payments || [];

  if (params.date_start) {
    filteredEntries = filteredEntries.filter((e: any) => e.created_at >= `${params.date_start}T00:00:00`);
    filteredPayments = filteredPayments.filter((p: any) => p.created_at >= `${params.date_start}T00:00:00`);
  }
  if (params.date_end) {
    filteredEntries = filteredEntries.filter((e: any) => e.created_at <= `${params.date_end}T23:59:59`);
    filteredPayments = filteredPayments.filter((p: any) => p.created_at <= `${params.date_end}T23:59:59`);
  }

  const customerSummary = (customers || []).map((c: any) => {
    const cEntries = (entries || []).filter((e: any) => e.customer_id === c.id);
    const cPayments = (payments || []).filter((p: any) => p.customer_id === c.id);
    const totalDebt = cEntries.filter((e: any) => !e.is_paid).reduce((s: number, e: any) => s + Number(e.total_price || 0), 0);
    const totalPaid = cPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    return { name: c.name, whatsapp: c.whatsapp, is_active: c.is_active, total_entries: cEntries.length, pending_balance: totalDebt, total_paid: totalPaid };
  });

  let result = customerSummary;
  if (params.customer_name) {
    result = result.filter((c: any) => c.name.toLowerCase().includes(params.customer_name.toLowerCase()));
  }
  if (params.pending_only) {
    result = result.filter((c: any) => c.pending_balance > 0);
  }

  return {
    total_customers: result.length,
    total_pending: result.reduce((s: number, c: any) => s + c.pending_balance, 0),
    customers: result.sort((a: any, b: any) => b.pending_balance - a.pending_balance),
  };
}

async function executeQueryOpenBottles(supabase: any, params: any) {
  let query = supabase.from('open_bottles').select('*');
  if (!params.include_empty) query = query.eq('is_empty', false);
  if (params.search) query = query.ilike('product_name', `%${params.search}%`);
  const { data, error } = await query.order('opened_at', { ascending: false });
  if (error) throw error;

  return {
    total_bottles: data.length,
    total_remaining_doses: data.reduce((s: number, b: any) => s + b.remaining_doses, 0),
    bottles: data.map((b: any) => ({
      product_name: b.product_name, total_doses: b.total_doses, remaining_doses: b.remaining_doses,
      dose_price: b.dose_price, is_empty: b.is_empty, opened_at: b.opened_at, opened_by: b.opened_by,
    })),
  };
}

async function executeQueryEmployees(supabase: any, params: any) {
  let query = supabase.from('employees').select('*');
  if (params.active_only) query = query.eq('is_active', true);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return { total: data.length, employees: data.map((e: any) => ({ name: e.name, is_active: e.is_active, whatsapp: e.whatsapp })) };
}

async function executeQueryPlatformSales(supabase: any, params: any) {
  let query = supabase.from('platform_sales').select('*');
  if (params.date_start) query = query.gte('created_at', `${params.date_start}T00:00:00`);
  if (params.date_end) query = query.lte('created_at', `${params.date_end}T23:59:59`);
  if (params.platform) query = query.ilike('platform', `%${params.platform}%`);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1000);
  if (error) throw error;

  const byPlatform = data.reduce((a: any, s: any) => {
    if (!a[s.platform]) a[s.platform] = { count: 0, revenue: 0 };
    a[s.platform].count += s.quantity;
    a[s.platform].revenue += Number(s.total_price || 0);
    return a;
  }, {});

  return {
    total_sales: data.length,
    total_revenue: data.reduce((s: number, x: any) => s + Number(x.total_price || 0), 0),
    by_platform: byPlatform,
    recent: data.slice(0, 20).map((s: any) => ({ platform: s.platform, product: s.product_name, quantity: s.quantity, total: s.total_price, date: s.created_at })),
  };
}

async function executeQueryCategories(supabase: any, params: any) {
  let query = supabase.from('categories').select('*');
  if (params.active_only) query = query.eq('is_active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;

  // Count products per category
  const { data: products } = await supabase.from('products').select('category_id, is_active');
  const catCounts = (products || []).reduce((a: any, p: any) => {
    if (p.category_id) {
      if (!a[p.category_id]) a[p.category_id] = { total: 0, active: 0 };
      a[p.category_id].total += 1;
      if (p.is_active) a[p.category_id].active += 1;
    }
    return a;
  }, {});

  return {
    total: data.length,
    categories: data.map((c: any) => ({ name: c.name, is_active: c.is_active, is_special: c.is_special, products_count: catCounts[c.id]?.total || 0, active_products: catCounts[c.id]?.active || 0 })),
  };
}

async function executeQuerySettings(supabase: any) {
  const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return { message: 'Nenhuma configuração encontrada' };
  return {
    store_address: data.store_address,
    is_open: data.is_open,
    delivery_rate_per_km: data.delivery_rate_per_km,
    min_delivery_fee: data.min_delivery_fee,
    max_delivery_distance: data.max_delivery_distance,
    pix_key: data.pix_key ? '***configurada***' : 'não configurada',
    opening_hours: data.opening_hours,
  };
}

async function executeQuerySpecialDrinks(supabase: any, params: any) {
  const { data: configs } = await supabase.from('special_drink_configs').select('*').order('sort_order');
  const result: any = {
    configs: (configs || []).map((c: any) => ({ label: c.label, slug: c.slug, is_enabled: c.is_enabled, base_price: c.base_price, max_doses: c.max_doses, max_frutas: c.max_frutas })),
  };

  if (params.include_fruits) {
    const { data: fruits } = await supabase.from('drink_fruits').select('*').eq('is_active', true).order('sort_order');
    result.fruits = (fruits || []).map((f: any) => ({ name: f.name, price: f.price }));
  }

  if (params.include_recipes) {
    const { data: recipes } = await supabase.from('special_drink_recipes').select('*, products(name)').limit(200);
    result.recipes = (recipes || []).map((r: any) => ({ product: r.products?.name || r.bottle_product_name, ingredient_type: r.ingredient_type, quantity: r.quantity }));
  }

  return result;
}

// Execute tool dispatcher
async function executeTool(supabase: any, toolName: string, args: any) {
  console.log(`Executing tool: ${toolName}`, args);
  switch (toolName) {
    case 'query_orders': return await executeQueryOrders(supabase, args);
    case 'query_products': return await executeQueryProducts(supabase, args);
    case 'query_sales_summary': return await executeQuerySalesSummary(supabase, args);
    case 'query_customers': return await executeQueryCustomers(supabase, args);
    case 'query_motoboys': return await executeQueryMotoboys(supabase, args);
    case 'query_cash_register': return await executeQueryCashRegister(supabase, args);
    case 'query_coupons': return await executeQueryCoupons(supabase, args);
    case 'query_order_items': return await executeQueryOrderItems(supabase, args);
    case 'query_caderneta': return await executeQueryCaderneta(supabase, args);
    case 'query_open_bottles': return await executeQueryOpenBottles(supabase, args);
    case 'query_employees': return await executeQueryEmployees(supabase, args);
    case 'query_platform_sales': return await executeQueryPlatformSales(supabase, args);
    case 'query_categories': return await executeQueryCategories(supabase, args);
    case 'query_settings': return await executeQuerySettings(supabase);
    case 'query_special_drinks': return await executeQuerySpecialDrinks(supabase, args);
    default: throw new Error(`Unknown tool: ${toolName}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) throw new Error('Messages array is required');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `Você é o assistente inteligente da VM Brasil Conveniência. Você tem acesso COMPLETO a todos os dados do sistema.

INSTRUÇÕES:
- Responda de forma clara, objetiva e amigável em português brasileiro
- Formate valores monetários em Reais (R$) usando formato brasileiro (R$ 1.234,56)
- Formate datas no padrão brasileiro (DD/MM/YYYY)
- Se a pergunta for sobre "hoje", use a data: ${today}
- Para vendas/faturamento, considere apenas pedidos não cancelados
- Seja conciso mas informativo

CAPACIDADES COMPLETAS:
- Pedidos, vendas, faturamento (por período, status, tipo, pagamento)
- Estoque, produtos, preços de custo e venda
- Clientes e top compradores
- Motoboys, status e entregas
- Caixa: sessão aberta, sangrias, suprimentos, fechamentos
- Cupons ativos e utilizados
- Produtos mais vendidos (itens de pedido)
- Caderneta (fiado): clientes, saldos devedores, pagamentos
- Garrafas abertas: doses restantes, consumo
- Funcionários ativos/inativos
- Vendas em plataformas externas (iFood, Rappi, etc)
- Categorias de produtos e contagem
- Configurações da loja (endereço, horários, taxas)
- Bebidas especiais: configurações, frutas, receitas`;

    const callAI = async (msgs: any[], includeTools = true) => {
      const body: any = {
        model: 'google/gemini-3-flash-preview',
        messages: [{ role: 'system', content: systemPrompt }, ...msgs],
      };
      if (includeTools) { body.tools = tools; body.tool_choice = 'auto'; }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const status = response.status;
        const errorText = await response.text();
        console.error('AI Gateway error:', status, errorText);
        if (status === 429) throw new Error('Limite de requisições atingido. Tente novamente em alguns segundos.');
        if (status === 402) throw new Error('Créditos de IA esgotados.');
        throw new Error(`Erro no gateway de IA: ${status}`);
      }
      return await response.json();
    };

    const initialResult = await callAI(messages);
    const assistantMessage = initialResult.choices[0].message;

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('AI requested tools:', assistantMessage.tool_calls.length);

      const toolResults = [];
      for (const toolCall of assistantMessage.tool_calls) {
        try {
          const result = await executeTool(supabase, toolCall.function.name, JSON.parse(toolCall.function.arguments || '{}'));
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        } catch (err) {
          console.error(`Tool ${toolCall.function.name} error:`, err);
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido' }) });
        }
      }

      const finalResult = await callAI([...messages, assistantMessage, ...toolResults], false);
      return new Response(JSON.stringify({ content: finalResult.choices[0].message.content }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ content: assistantMessage.content }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('AI Assistant error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro desconhecido', fallback: true, content: 'Assistente temporariamente indisponível.' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
