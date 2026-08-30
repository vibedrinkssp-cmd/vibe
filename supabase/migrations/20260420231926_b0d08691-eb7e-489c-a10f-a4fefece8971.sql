-- ============================================================================
-- ONDA 1: Integridade de Totais
-- ============================================================================

-- 1) Função interna: recalcula subtotal/total de um pedido
CREATE OR REPLACE FUNCTION public.recompute_order_total(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_delivery_fee numeric := 0;
  v_discount numeric := 0;
BEGIN
  -- Soma real dos itens
  SELECT COALESCE(SUM(quantity * unit_price), 0)
    INTO v_subtotal
    FROM public.order_items
   WHERE order_id = p_order_id;

  -- Preserva delivery_fee e discount já registrados no pedido
  SELECT COALESCE(delivery_fee, 0), COALESCE(discount, 0)
    INTO v_delivery_fee, v_discount
    FROM public.orders
   WHERE id = p_order_id;

  -- Atualiza pedido com totais corretos
  UPDATE public.orders
     SET subtotal = v_subtotal,
         total = GREATEST(0, v_subtotal + v_delivery_fee - v_discount)
   WHERE id = p_order_id;
END;
$$;

-- 2) Trigger: recalcula automaticamente quando order_items muda
CREATE OR REPLACE FUNCTION public.trg_recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_order_total(OLD.order_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_order_total(NEW.order_id);
    -- Se UPDATE mudou order_id, recalcula o antigo também
    IF TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id THEN
      PERFORM public.recompute_order_total(OLD.order_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

-- Recria trigger garantindo idempotência
DROP TRIGGER IF EXISTS trg_order_items_recompute ON public.order_items;
CREATE TRIGGER trg_order_items_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_order_total();

-- 3) RPC pública para admin recalcular manualmente um pedido específico
CREATE OR REPLACE FUNCTION public.admin_recompute_order_total(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before record;
  v_after record;
BEGIN
  -- Permissão: somente admin ou pdv
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'pdv'::app_role)) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT subtotal, total INTO v_before FROM public.orders WHERE id = p_order_id;

  PERFORM public.recompute_order_total(p_order_id);

  SELECT subtotal, total INTO v_after FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'before', jsonb_build_object('subtotal', v_before.subtotal, 'total', v_before.total),
    'after',  jsonb_build_object('subtotal', v_after.subtotal,  'total', v_after.total)
  );
END;
$$;

-- 4) RPC para varredura geral: corrige todos pedidos divergentes (admin only)
CREATE OR REPLACE FUNCTION public.admin_recompute_all_divergent_orders(p_days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_order record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOR v_order IN
    SELECT o.id
      FROM public.orders o
     WHERE o.created_at >= now() - (p_days_back || ' days')::interval
       AND ABS(
             COALESCE(o.subtotal, 0) -
             COALESCE((SELECT SUM(quantity * unit_price) FROM public.order_items WHERE order_id = o.id), 0)
           ) > 0.01
  LOOP
    PERFORM public.recompute_order_total(v_order.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('orders_fixed', v_count, 'days_back', p_days_back);
END;
$$;

-- Permissões
REVOKE ALL ON FUNCTION public.recompute_order_total(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recompute_order_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recompute_all_divergent_orders(integer) TO authenticated;