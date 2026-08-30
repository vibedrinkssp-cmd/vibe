-- ===============================================
-- ONDA 8: Atomicidade Reflexológica Generalizada
-- ===============================================

-- 8.1 BACKFILL: Recalcular totais divergentes
UPDATE orders 
SET total = subtotal + COALESCE(delivery_fee, 0) - COALESCE(discount, 0)
WHERE ABS(total - (subtotal + COALESCE(delivery_fee, 0) - COALESCE(discount, 0))) > 0.02;

-- 8.1 BACKFILL: Limpar motoboy_id órfão (motoboy excluído mas pedido ainda referencia)
UPDATE orders SET motoboy_id = NULL
WHERE motoboy_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM motoboys m WHERE m.id = orders.motoboy_id);

-- 8.1 BACKFILL: Linkar caderneta_entries.product_id por nome quando possível
UPDATE caderneta_entries ce
SET product_id = p.id
FROM products p
WHERE ce.product_id IS NULL
  AND UPPER(TRIM(ce.product_name)) = UPPER(TRIM(p.name))
  AND ce.created_at > now() - interval '60 days';

-- ===============================================
-- 8.2 TRIGGER ATÔMICO DE TOTAL
-- Garante que total = subtotal + delivery_fee - discount
-- ===============================================
CREATE OR REPLACE FUNCTION public.enforce_order_total_consistency()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.subtotal := COALESCE(NEW.subtotal, 0);
  NEW.delivery_fee := COALESCE(NEW.delivery_fee, 0);
  NEW.discount := COALESCE(NEW.discount, 0);
  NEW.total := NEW.subtotal + NEW.delivery_fee - NEW.discount;
  IF NEW.total < 0 THEN NEW.total := 0; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_order_total ON public.orders;
CREATE TRIGGER trg_enforce_order_total
BEFORE INSERT OR UPDATE OF subtotal, delivery_fee, discount, total ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_total_consistency();

-- ===============================================
-- 8.3 TRIGGER REFLEXIVO: order_items → orders.subtotal
-- ===============================================
CREATE OR REPLACE FUNCTION public.recalc_order_subtotal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid;
  v_new_subtotal numeric;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  IF v_order_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO v_new_subtotal
  FROM order_items WHERE order_id = v_order_id;

  -- Atualiza subtotal — trigger 8.2 recalcula total automaticamente
  UPDATE orders SET subtotal = v_new_subtotal WHERE id = v_order_id;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_recalc_order_subtotal ON public.order_items;
CREATE TRIGGER trg_recalc_order_subtotal
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.recalc_order_subtotal();

-- ===============================================
-- 8.4 PROTEÇÃO: Bloquear DELETE de motoboy com pedidos ativos
-- ===============================================
CREATE OR REPLACE FUNCTION public.guard_motoboy_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_active_count integer;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM orders 
  WHERE motoboy_id = OLD.id 
    AND status NOT IN ('delivered', 'cancelled');
  
  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Motoboy possui % pedido(s) ativo(s). Finalize ou reatribua antes de excluir.', v_active_count
      USING ERRCODE = 'check_violation';
  END IF;
  
  -- Limpa referências em pedidos finalizados antes do delete
  UPDATE orders SET motoboy_id = NULL WHERE motoboy_id = OLD.id;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_guard_motoboy_delete ON public.motoboys;
CREATE TRIGGER trg_guard_motoboy_delete
BEFORE DELETE ON public.motoboys
FOR EACH ROW EXECUTE FUNCTION public.guard_motoboy_delete();

-- ===============================================
-- 8.5 CADERNETA ATÔMICA: linkar product_id e abater estoque
-- ===============================================
CREATE OR REPLACE FUNCTION public.create_caderneta_entry(
  p_customer_id uuid,
  p_product_name text,
  p_quantity integer,
  p_unit_price numeric,
  p_salesperson text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_product_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry_id uuid;
  v_product_id uuid;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role)) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Resolver product_id: usa o passado ou busca por nome
  v_product_id := p_product_id;
  IF v_product_id IS NULL THEN
    SELECT id INTO v_product_id FROM products
    WHERE UPPER(TRIM(name)) = UPPER(TRIM(p_product_name)) AND is_active = true
    LIMIT 1;
  END IF;

  INSERT INTO caderneta_entries (
    customer_id, product_id, product_name, quantity, unit_price, total_price, salesperson, notes
  ) VALUES (
    p_customer_id, v_product_id, p_product_name, p_quantity, p_unit_price,
    p_quantity * p_unit_price, p_salesperson, p_notes
  ) RETURNING id INTO v_entry_id;

  -- Abater estoque atomicamente se produto identificado
  IF v_product_id IS NOT NULL THEN
    BEGIN
      PERFORM deduct_product_stock(v_product_id, p_quantity);
    EXCEPTION WHEN OTHERS THEN
      -- Não falha o lançamento se o produto não tem controle de estoque
      NULL;
    END;
  END IF;

  RETURN v_entry_id;
END $$;

-- ===============================================
-- 8.6 VIEW DE AUDITORIA REFLEXOLÓGICA
-- ===============================================
CREATE OR REPLACE VIEW public.v_reflexive_consistency AS
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

-- RPC para consumir a view (admin only)
CREATE OR REPLACE FUNCTION public.get_reflexive_consistency_report()
RETURNS TABLE(check_type text, total_count bigint, latest_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;
  
  RETURN QUERY
  SELECT v.check_type, COUNT(*)::bigint, MAX(v.created_at)
  FROM v_reflexive_consistency v
  GROUP BY v.check_type;
END $$;