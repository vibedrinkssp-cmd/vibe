CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_recipe RECORD;
  v_needed integer;
  v_ingredient_product_id uuid;
  v_ingredient_name text;
  v_bottle RECORD;
BEGIN
  -- 1) Restaurar estoque dos itens
  FOR v_item IN
    SELECT oi.product_id, oi.product_name, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity
      WHERE id = v_item.product_id;
    END IF;

    -- Restaurar doses de garrafas / ingredientes de drinks especiais
    IF v_item.product_id IS NOT NULL THEN
      FOR v_recipe IN
        SELECT r.ingredient_type, r.ingredient_product_id, r.bottle_product_name, r.quantity AS recipe_qty
        FROM public.special_drink_recipes r
        WHERE r.product_id = v_item.product_id
      LOOP
        v_needed := v_recipe.recipe_qty * v_item.quantity;
        v_ingredient_product_id := v_recipe.ingredient_product_id;
        v_ingredient_name := v_recipe.bottle_product_name;

        IF v_recipe.ingredient_type = 'dose' THEN
          IF v_ingredient_product_id IS NULL AND v_ingredient_name IS NOT NULL THEN
            SELECT p.id INTO v_ingredient_product_id
            FROM public.products p
            WHERE p.name ILIKE v_ingredient_name
            ORDER BY p.is_active DESC, p.created_at DESC
            LIMIT 1;
          END IF;

          IF v_ingredient_product_id IS NOT NULL THEN
            FOR v_bottle IN
              SELECT ob.id, ob.remaining_doses, ob.total_doses
              FROM public.open_bottles ob
              WHERE ob.product_id = v_ingredient_product_id
              ORDER BY ob.is_empty ASC, ob.opened_at DESC
              FOR UPDATE
            LOOP
              EXIT WHEN v_needed <= 0;
              DECLARE
                v_can_add integer;
              BEGIN
                v_can_add := LEAST(v_needed, v_bottle.total_doses - v_bottle.remaining_doses);
                IF v_can_add > 0 THEN
                  UPDATE public.open_bottles
                  SET remaining_doses = remaining_doses + v_can_add,
                      is_empty = false,
                      emptied_at = NULL
                  WHERE id = v_bottle.id;
                  v_needed := v_needed - v_can_add;
                END IF;
              END;
            END LOOP;
          END IF;

        ELSIF v_recipe.ingredient_type = 'product' THEN
          IF v_ingredient_product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_needed
            WHERE id = v_ingredient_product_id;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 2) Liberar cupons usados (FK sem CASCADE bloqueava o delete)
  UPDATE public.user_coupons
  SET is_used = false,
      used_at = NULL,
      used_in_order_id = NULL
  WHERE used_in_order_id = p_order_id;

  -- 3) Apagar comprovantes de pagamento associados
  DELETE FROM public.payment_confirmations WHERE order_id = p_order_id;

  -- 4) Soltar referências em audit/logs para manter histórico sem bloquear a exclusão
  UPDATE public.pix_payment_audit SET order_id = NULL WHERE order_id = p_order_id;

  -- 5) Excluir o pedido; order_items/motoboy_locations/ifood logs cuidam por CASCADE/SET NULL
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$function$;