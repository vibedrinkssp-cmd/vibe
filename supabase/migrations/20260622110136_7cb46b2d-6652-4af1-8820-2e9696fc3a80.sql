GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_with_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_with_items() TO service_role;

CREATE OR REPLACE FUNCTION public.get_kitchen_orders_with_items()
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
  delivery_fee_adjusted_at timestamptz,
  delivery_distance numeric,
  discount numeric,
  total numeric,
  payment_method public.payment_method,
  change_for numeric,
  notes text,
  customer_name text,
  salesperson text,
  motoboy_id uuid,
  created_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  picked_up_at timestamptz,
  arrived_at timestamptz,
  delivered_at timestamptz,
  payment_confirmed boolean,
  payment_confirmed_at timestamptz,
  payment_confirmed_by text,
  external_origin text,
  external_order_id text,
  mp_payment_id text,
  customer_resolved_name text,
  customer_whatsapp text,
  address_payload jsonb,
  items_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    o.id, o.user_id, o.address_id, o.order_type, o.status, o.subtotal,
    o.delivery_fee, o.original_delivery_fee, o.delivery_fee_adjusted, o.delivery_fee_adjusted_at,
    o.delivery_distance, o.discount, o.total, o.payment_method, o.change_for, o.notes,
    o.customer_name, o.salesperson, o.motoboy_id, o.created_at, o.accepted_at, o.preparing_at,
    o.ready_at, o.dispatched_at, o.picked_up_at, o.arrived_at, o.delivered_at,
    o.payment_confirmed, o.payment_confirmed_at, o.payment_confirmed_by,
    o.external_origin, o.external_order_id, o.mp_payment_id,
    COALESCE(NULLIF(o.customer_name, ''), NULLIF(u.name, ''), 'CLIENTE') AS customer_resolved_name,
    u.whatsapp AS customer_whatsapp,
    CASE WHEN a.id IS NOT NULL THEN jsonb_build_object(
      'id', a.id, 'user_id', a.user_id, 'street', a.street, 'number', a.number,
      'complement', a.complement, 'neighborhood', a.neighborhood, 'city', a.city,
      'state', a.state, 'zip_code', a.zip_code, 'notes', a.notes,
      'is_default', a.is_default, 'latitude', a.latitude, 'longitude', a.longitude
    ) ELSE NULL END AS address_payload,
    COALESCE(items.items_payload, '[]'::jsonb) AS items_payload
  FROM public.orders o
  LEFT JOIN public.users u ON u.id = o.user_id
  LEFT JOIN public.addresses a ON a.id = o.address_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', oi.id, 'order_id', oi.order_id, 'product_id', oi.product_id,
        'product_name', oi.product_name, 'quantity', oi.quantity,
        'unit_price', oi.unit_price, 'total_price', oi.total_price,
        'is_wizard_item', oi.is_wizard_item
      ) ORDER BY oi.id ASC
    ) AS items_payload
    FROM public.order_items oi
    WHERE oi.order_id = o.id
  ) items ON true
  WHERE o.status IN ('accepted', 'preparing', 'ready', 'dispatched')
    AND o.created_at > now() - interval '24 hours'
    AND COALESCE(o.external_origin, '') <> 'ifood_test'
    AND lower(COALESCE(o.salesperson, '')) NOT IN ('ifood', 'rappi', '99food', 'keeta')
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
        AND (
          COALESCE(oi.is_wizard_item, false) = true
          OR COALESCE(p.is_prepared, false) = true
          OR (
            oi.product_id IS NULL
            AND (
              oi.product_name ILIKE '%caipirinha%'
              OR oi.product_name ILIKE '%caipi ice%'
              OR oi.product_name ILIKE '%caipiice%'
              OR oi.product_name ILIKE '%caipi-ice%'
              OR oi.product_name ILIKE '%copao%'
              OR oi.product_name ILIKE '%copão%'
              OR oi.product_name ILIKE '%drink %'
              OR oi.product_name ILIKE '%drink de%'
              OR oi.product_name ILIKE '%drinks %'
              OR oi.product_name ILIKE '%drinks de%'
              OR oi.product_name ILIKE '%batida %'
            )
          )
        )
    )
  ORDER BY o.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_with_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_with_items() TO service_role;