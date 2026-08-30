CREATE OR REPLACE FUNCTION public.get_pager_orders()
 RETURNS TABLE(id uuid, short_number text, customer_name text, order_type order_type, status order_status, created_at timestamp with time zone, ready_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND o.status IN ('accepted','preparing','ready')
    AND o.created_at > now() - interval '6 hours'
  ORDER BY o.ready_at NULLS LAST, o.created_at;
$function$;