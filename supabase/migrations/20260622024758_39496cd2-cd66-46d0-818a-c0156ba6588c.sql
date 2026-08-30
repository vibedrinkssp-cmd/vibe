CREATE OR REPLACE FUNCTION public.get_pager_orders()
RETURNS TABLE (
  id uuid,
  short_number text,
  customer_name text,
  order_type public.order_type,
  status public.order_status,
  created_at timestamptz,
  ready_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    upper(right(o.id::text, 4)) AS short_number,
    coalesce(nullif(trim(o.customer_name), ''), 'CLIENTE') AS customer_name,
    o.order_type,
    o.status,
    o.created_at,
    o.ready_at
  FROM public.orders o
  WHERE o.order_type IN ('counter','totem','pickup')
    AND o.status IN ('preparing','ready')
    AND o.created_at > now() - interval '6 hours'
  ORDER BY o.ready_at NULLS LAST, o.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_pager_orders() TO anon, authenticated, service_role;