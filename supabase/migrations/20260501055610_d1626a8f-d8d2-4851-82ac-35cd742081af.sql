-- ============================================================
-- EDIÇÃO MANUAL DE PEDIDOS PELO ADMIN
-- - Permite trocar/adicionar/remover itens de um pedido
-- - Bloqueia se: pago online (mp_payment_id), já despachado/coletado/entregue/cancelado
-- - Devolve estoque dos removidos, desconta dos adicionados (FOR UPDATE)
-- - Triggers existentes recalculam subtotal e total automaticamente
-- - Audita em cash_register_audit
-- ============================================================

-- Helper: pode editar?
CREATE OR REPLACE FUNCTION public.can_edit_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_mp text;
  v_picked timestamptz;
  v_confirmed_by text;
BEGIN
  SELECT status::text, mp_payment_id, picked_up_at, payment_confirmed_by
    INTO v_status, v_mp, v_picked, v_confirmed_by
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_status NOT IN ('pending','accepted','preparing','ready') THEN RETURN false; END IF;
  IF v_mp IS NOT NULL AND length(trim(v_mp)) > 0 THEN RETURN false; END IF;
  IF v_picked IS NOT NULL THEN RETURN false; END IF;
  IF v_confirmed_by IS NOT NULL AND v_confirmed_by ILIKE '%(online)%' THEN RETURN false; END IF;
  RETURN true;
END $$;

-- RPC principal
CREATE OR REPLACE FUNCTION public.edit_order_items(
  p_order_id uuid,
  p_changes jsonb,
  p_admin text DEFAULT 'ADMIN'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_change jsonb;
  v_op text;
  v_item_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_quantity integer;
  v_unit_price numeric;
  v_total_price numeric;
  v_existing record;
  v_delta integer;
  v_old_total numeric;
  v_new_total numeric;
  v_changes_count integer := 0;
  v_diff_log text := '';
  v_is_prepared boolean;
  v_curr_stock integer;
BEGIN
  -- 1) Lock do pedido
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  -- 2) Valida elegibilidade
  IF NOT public.can_edit_order(p_order_id) THEN
    RAISE EXCEPTION 'Pedido não pode ser editado (status %, pago online ou já despachado)', v_order.status;
  END IF;

  v_old_total := v_order.total;

  -- 3) Itera mudanças
  FOR v_change IN SELECT * FROM jsonb_array_elements(COALESCE(p_changes, '[]'::jsonb))
  LOOP
    v_op := v_change->>'op';
    v_item_id := NULLIF(v_change->>'item_id','')::uuid;
    v_product_id := NULLIF(v_change->>'product_id','')::uuid;
    v_product_name := COALESCE(v_change->>'product_name','');
    v_quantity := COALESCE(NULLIF(v_change->>'quantity','')::int, 0);
    v_unit_price := COALESCE(NULLIF(v_change->>'unit_price','')::numeric, 0);

    IF v_op = 'delete' THEN
      SELECT * INTO v_existing FROM order_items WHERE id = v_item_id AND order_id = p_order_id FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      IF v_existing.is_wizard_item THEN
        RAISE EXCEPTION 'Item de bebida montada não pode ser editado/removido (id=%)', v_item_id;
      END IF;
      -- Devolve estoque
      IF v_existing.product_id IS NOT NULL THEN
        SELECT COALESCE(stock,0), COALESCE(is_prepared,false) INTO v_curr_stock, v_is_prepared
        FROM products WHERE id = v_existing.product_id FOR UPDATE;
        IF FOUND AND NOT v_is_prepared THEN
          UPDATE products SET stock = v_curr_stock + v_existing.quantity WHERE id = v_existing.product_id;
        END IF;
      END IF;
      DELETE FROM order_items WHERE id = v_item_id;
      v_diff_log := v_diff_log || format('DEL %s x%s; ', v_existing.product_name, v_existing.quantity);
      v_changes_count := v_changes_count + 1;

    ELSIF v_op = 'update' THEN
      SELECT * INTO v_existing FROM order_items WHERE id = v_item_id AND order_id = p_order_id FOR UPDATE;
      IF NOT FOUND THEN CONTINUE; END IF;
      IF v_existing.is_wizard_item THEN
        RAISE EXCEPTION 'Item de bebida montada não pode ser editado (id=%)', v_item_id;
      END IF;
      IF v_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantidade inválida (%) para item %', v_quantity, v_item_id;
      END IF;
      IF v_unit_price < 0 THEN
        RAISE EXCEPTION 'Preço inválido (%) para item %', v_unit_price, v_item_id;
      END IF;
      v_delta := v_quantity - v_existing.quantity; -- positivo: precisa descontar mais; negativo: devolver
      IF v_existing.product_id IS NOT NULL AND v_delta <> 0 THEN
        SELECT COALESCE(stock,0), COALESCE(is_prepared,false) INTO v_curr_stock, v_is_prepared
        FROM products WHERE id = v_existing.product_id FOR UPDATE;
        IF FOUND AND NOT v_is_prepared THEN
          UPDATE products
            SET stock = GREATEST(0, v_curr_stock - v_delta)
            WHERE id = v_existing.product_id;
        END IF;
      END IF;
      v_total_price := round(v_quantity * v_unit_price, 2);
      UPDATE order_items
        SET quantity = v_quantity,
            unit_price = v_unit_price,
            total_price = v_total_price
        WHERE id = v_item_id;
      v_diff_log := v_diff_log || format('UPD %s -> qty %s x R$%s; ', v_existing.product_name, v_quantity, v_unit_price);
      v_changes_count := v_changes_count + 1;

    ELSIF v_op = 'add' THEN
      IF v_quantity <= 0 OR v_unit_price < 0 OR length(v_product_name) = 0 THEN
        RAISE EXCEPTION 'Dados inválidos para adicionar item';
      END IF;
      v_total_price := round(v_quantity * v_unit_price, 2);
      -- INSERT dispara trigger trg_deduct_stock_on_order_item (já existente)
      INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, total_price, is_wizard_item)
      VALUES (p_order_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_total_price, false);
      v_diff_log := v_diff_log || format('ADD %s x%s @ R$%s; ', v_product_name, v_quantity, v_unit_price);
      v_changes_count := v_changes_count + 1;

    ELSE
      RAISE EXCEPTION 'Operação desconhecida: %', v_op;
    END IF;
  END LOOP;

  -- 4) Se havia confirmação manual de pagamento (não MP), invalida — admin reconfirma na entrega
  IF v_order.payment_confirmed AND (v_order.mp_payment_id IS NULL OR length(trim(v_order.mp_payment_id)) = 0) THEN
    UPDATE orders 
      SET payment_confirmed = false,
          payment_confirmed_at = NULL,
          payment_confirmed_by = NULL
      WHERE id = p_order_id;
  END IF;

  -- 5) Lê novo total (já recalculado pelos triggers)
  SELECT total INTO v_new_total FROM orders WHERE id = p_order_id;

  -- 6) Auditoria
  INSERT INTO cash_register_audit (action, responsible, notes)
  VALUES (
    'ORDER_EDITED',
    p_admin,
    format('[ORDER:%s] Antes R$ %s -> Depois R$ %s | Mudanças (%s): %s',
      p_order_id, v_old_total, v_new_total, v_changes_count, v_diff_log)
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'old_total', v_old_total,
    'new_total', v_new_total,
    'items_changed', v_changes_count
  );
END $$;

GRANT EXECUTE ON FUNCTION public.edit_order_items(uuid, jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_order(uuid) TO authenticated, anon;