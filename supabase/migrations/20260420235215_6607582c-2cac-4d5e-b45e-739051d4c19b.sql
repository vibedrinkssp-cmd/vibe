-- Recriar view sem SECURITY DEFINER e restringir acesso
DROP VIEW IF EXISTS public.v_reflexive_consistency;

CREATE VIEW public.v_reflexive_consistency 
WITH (security_invoker = true) AS
SELECT 
  'orders_total_divergente' as check_type,
  o.id::text as record_id,
  jsonb_build_object(
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'discount', o.discount, 'total_atual', o.total,
    'total_esperado', o.subtotal + COALESCE(o.delivery_fee,0) - COALESCE(o.discount,0)
  ) as details,
  o.created_at
FROM orders o
WHERE ABS(o.total - (o.subtotal + COALESCE(o.delivery_fee,0) - COALESCE(o.discount,0))) > 0.02

UNION ALL
SELECT 
  'orders_subtotal_divergente_dos_itens',
  o.id::text,
  jsonb_build_object(
    'subtotal_atual', o.subtotal,
    'soma_itens', COALESCE((SELECT SUM(total_price) FROM order_items WHERE order_id=o.id), 0)
  ),
  o.created_at
FROM orders o
WHERE EXISTS (SELECT 1 FROM order_items WHERE order_id = o.id)
  AND ABS(o.subtotal - COALESCE((SELECT SUM(total_price) FROM order_items WHERE order_id=o.id), 0)) > 0.02

UNION ALL
SELECT 
  'pedido_dispatched_sem_motoboy',
  o.id::text,
  jsonb_build_object('status', o.status, 'order_type', o.order_type),
  o.created_at
FROM orders o
WHERE o.order_type='delivery' 
  AND o.status IN ('dispatched','arrived','delivered') 
  AND o.motoboy_id IS NULL

UNION ALL
SELECT 
  'caderneta_sem_product_id_existente',
  ce.id::text,
  jsonb_build_object('product_name', ce.product_name, 'customer_id', ce.customer_id),
  ce.created_at
FROM caderneta_entries ce
WHERE ce.product_id IS NULL
  AND EXISTS (SELECT 1 FROM products p WHERE UPPER(TRIM(p.name)) = UPPER(TRIM(ce.product_name)))

UNION ALL
SELECT 
  'motoboy_id_orfao',
  o.id::text,
  jsonb_build_object('motoboy_id', o.motoboy_id),
  o.created_at
FROM orders o
WHERE o.motoboy_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM motoboys m WHERE m.id = o.motoboy_id);

REVOKE ALL ON public.v_reflexive_consistency FROM anon, authenticated;
GRANT SELECT ON public.v_reflexive_consistency TO service_role;