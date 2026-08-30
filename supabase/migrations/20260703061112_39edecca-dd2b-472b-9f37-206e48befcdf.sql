
-- 1) Finaliza pedidos de TOTEM que não têm nada para preparar na cozinha.
CREATE OR REPLACE FUNCTION public.finalize_totem_retail_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders o
  SET status = 'delivered',
      ready_at = COALESCE(o.ready_at, o.accepted_at, o.created_at),
      delivered_at = COALESCE(o.delivered_at, now())
  WHERE o.id IN (SELECT DISTINCT order_id FROM new_items)
    AND o.order_type = 'totem'
    AND o.status IN ('accepted', 'preparing')
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
        AND (COALESCE(oi.is_wizard_item, false) = true OR COALESCE(p.is_prepared, false) = true)
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_totem_retail ON public.order_items;
CREATE TRIGGER trg_finalize_totem_retail
AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS new_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.finalize_totem_retail_orders();

-- 2) Rede de segurança: fecha pedidos não-delivery abertos há muito tempo.
CREATE OR REPLACE FUNCTION public.cleanup_stale_open_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'delivered',
      ready_at = COALESCE(ready_at, accepted_at, created_at),
      delivered_at = COALESCE(delivered_at, now())
  WHERE status IN ('accepted', 'preparing')
    AND order_type <> 'delivery'
    AND created_at < now() - interval '12 hours';
END;
$$;

-- 3) Agenda a rede de segurança a cada 30 minutos (SQL puro, sem segredos).
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-stale-open-orders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'cleanup-stale-open-orders',
  '*/30 * * * *',
  $$ SELECT public.cleanup_stale_open_orders(); $$
);
