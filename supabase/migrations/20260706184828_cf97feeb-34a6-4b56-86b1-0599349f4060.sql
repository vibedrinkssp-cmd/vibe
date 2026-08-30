-- RPCs para o totem (kiosk anônimo) reimprimir tickets de pedidos recentes.
-- Retornam apenas pedidos das últimas 8 horas, limitados, para uso no balcão.

CREATE OR REPLACE FUNCTION public.get_totem_recent_orders()
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT *
  FROM public.orders
  WHERE created_at >= now() - interval '8 hours'
  ORDER BY created_at DESC
  LIMIT 40;
$function$;

CREATE OR REPLACE FUNCTION public.get_totem_order_items(p_order_ids uuid[])
RETURNS SETOF public.order_items
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT oi.*
  FROM public.order_items oi
  WHERE oi.order_id = ANY(p_order_ids)
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = oi.order_id
        AND o.created_at >= now() - interval '8 hours'
    );
$function$;

GRANT EXECUTE ON FUNCTION public.get_totem_recent_orders() TO anon;
GRANT EXECUTE ON FUNCTION public.get_totem_recent_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_totem_order_items(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_totem_order_items(uuid[]) TO authenticated;