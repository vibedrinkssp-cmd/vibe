import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
}

const TABLES = [
  'categories', 'users', 'employees', 'motoboys', 'settings',
  'addresses', 'products', 'banners', 'drink_fruits', 'special_drink_configs',
  'coupons', 'user_coupons', 'caderneta_customers', 'caderneta_entries',
  'orders', 'order_items', 'open_bottles',
  'cash_register_sessions', 'cash_register_closures',
  'sangrias', 'sangria_items', 'platform_sales', 'user_roles',
  'visitor_sessions', 'motoboy_locations',
]

async function fetchAllRows(supabase: any, table: string) {
  const allRows: any[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + pageSize - 1)
      .order('id' in {} ? 'id' : 'id', { ascending: true })

    if (error) {
      // Some tables might not have 'id', try without order
      const { data: data2, error: error2 } = await supabase
        .from(table)
        .select('*')
        .range(from, from + pageSize - 1)

      if (error2) throw error2
      if (!data2 || data2.length === 0) break
      allRows.push(...data2)
      if (data2.length < pageSize) break
    } else {
      if (!data || data.length === 0) break
      allRows.push(...data)
      if (data.length < pageSize) break
    }
    from += pageSize
  }

  return allRows
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate admin access
    const adminKey = req.headers.get('x-admin-key')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!adminKey || adminKey !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey!,
      { auth: { persistSession: false } }
    )

    // Check if specific tables requested
    const url = new URL(req.url)
    const requestedTables = url.searchParams.get('tables')
    const tablesToExport = requestedTables 
      ? requestedTables.split(',').filter(t => TABLES.includes(t))
      : TABLES

    const result: Record<string, any[]> = {}
    const errors: Record<string, string> = {}

    for (const table of tablesToExport) {
      try {
        const rows = await fetchAllRows(supabase, table)
        result[table] = rows
      } catch (err) {
        errors[table] = err.message
        result[table] = []
      }
    }

    return new Response(JSON.stringify({ data: result, errors, tables: tablesToExport }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
