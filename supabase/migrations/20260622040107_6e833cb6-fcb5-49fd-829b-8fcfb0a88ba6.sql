CREATE OR REPLACE FUNCTION public.get_log_orders_complete()
RETURNS TABLE(
  id uuid,
  user_id uuid,
  address_id uuid,
  order_type public.order_type,
  status public.order_status,
  subtotal numeric,
  delivery_fee numeric,
  original_delivery_fee numeric,
  delivery_fee_adjusted boolean,
  delivery_fee_adjusted_at timestamp with time zone,
  delivery_distance numeric,
  discount numeric,
  total numeric,
  payment_method public.payment_method,
  change_for numeric,
  notes text,
  customer_name text,
  salesperson text,
  motoboy_id uuid,
  created_at timestamp with time zone,
  accepted_at timestamp with time zone,
  preparing_at timestamp with time zone,
  ready_at timestamp with time zone,
  dispatched_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  arrived_at timestamp with time zone,
  delivered_at timestamp with time zone,
  payment_confirmed boolean,
  payment_confirmed_at timestamp with time zone,
  payment_confirmed_by text,
  external_origin text,
  external_order_id text,
  mp_payment_id text,
  customer_resolved_name text,
  customer_whatsapp text,
  address_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pdv'::public.app_role)
    OR public.has_role(auth.uid(), 'kitchen'::public.app_role)
    OR public.has_role(auth.uid(), 'motoboy'::public.app_role)
    OR public.has_role(auth.uid(), 'log'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe operacional';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.user_id,
    o.address_id,
    o.order_type,
    o.status,
    o.subtotal,
    o.delivery_fee,
    o.original_delivery_fee,
    o.delivery_fee_adjusted,
    o.delivery_fee_adjusted_at,
    o.delivery_distance,
    o.discount,
    o.total,
    o.payment_method,
    o.change_for,
    o.notes,
    o.customer_name,
    o.salesperson,
    o.motoboy_id,
    o.created_at,
    o.accepted_at,
    o.preparing_at,
    o.ready_at,
    o.dispatched_at,
    o.picked_up_at,
    o.arrived_at,
    o.delivered_at,
    o.payment_confirmed,
    o.payment_confirmed_at,
    o.payment_confirmed_by,
    o.external_origin,
    o.external_order_id,
    o.mp_payment_id,
    COALESCE(NULLIF(o.customer_name, ''), NULLIF(u.name, ''), 'CLIENTE') AS customer_resolved_name,
    u.whatsapp AS customer_whatsapp,
    CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
      'id', a.id,
      'user_id', a.user_id,
      'street', a.street,
      'number', a.number,
      'complement', a.complement,
      'neighborhood', a.neighborhood,
      'city', a.city,
      'state', a.state,
      'zip_code', a.zip_code,
      'notes', a.notes,
      'is_default', a.is_default,
      'latitude', a.latitude,
      'longitude', a.longitude
    ) ELSE NULL END AS address_payload
  FROM public.orders o
  LEFT JOIN public.users u ON u.id = o.user_id
  LEFT JOIN public.addresses a ON a.id = o.address_id
  WHERE o.status IN ('accepted', 'preparing', 'ready', 'dispatched', 'arrived')
    AND (
      o.created_at > now() - interval '36 hours'
      OR o.status IN ('ready', 'dispatched', 'arrived')
    )
  ORDER BY o.created_at DESC
  LIMIT 250;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_log_orders_complete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_log_orders_complete() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_log_orders_complete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_log_orders_complete() TO service_role;