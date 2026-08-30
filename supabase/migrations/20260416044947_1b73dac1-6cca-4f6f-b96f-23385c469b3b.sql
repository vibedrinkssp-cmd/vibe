
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_recipe RECORD;
  v_needed integer;
  v_ingredient_product_id uuid;
  v_ingredient_name text;
  v_bottle RECORD;
  v_base_name text;
  v_product_name text;
BEGIN
  -- Loop through all order items to restore stock
  FOR v_item IN
    SELECT oi.product_id, oi.product_name, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP

    -- 1) Restore product stock
    IF v_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity
      WHERE id = v_item.product_id;
    END IF;

    -- 2) Restore special drink doses (via recipes)
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
          -- Resolve product id from name if needed
          IF v_ingredient_product_id IS NULL AND v_ingredient_name IS NOT NULL THEN
            SELECT p.id INTO v_ingredient_product_id
            FROM public.products p
            WHERE p.name ILIKE v_ingredient_name
            ORDER BY p.is_active DESC, p.created_at DESC
            LIMIT 1;
          END IF;

          IF v_ingredient_product_id IS NOT NULL THEN
            -- Add doses back to the newest non-empty bottle (or most recent)
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
          -- Restore ingredient product stock
          IF v_ingredient_product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_needed
            WHERE id = v_ingredient_product_id;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- 3) Restore loose cigarettes to open packs
    v_product_name := UPPER(TRIM(v_item.product_name));
    IF v_product_name LIKE '%SOLTO%' OR v_product_name LIKE '%AVULSO%'
       OR v_product_name LIKE '%UNIDADE%' OR v_product_name LIKE '% UND%' THEN

      v_base_name := v_product_name;
      v_base_name := REPLACE(v_base_name, 'SOLTO', '');
      v_base_name := REPLACE(v_base_name, 'AVULSO', '');
      v_base_name := REPLACE(v_base_name, 'UNIDADE', '');
      v_base_name := REPLACE(v_base_name, 'UND', '');
      v_base_name := REPLACE(v_base_name, 'CIGARRO', '');
      v_base_name := REPLACE(v_base_name, '  ', ' ');
      v_base_name := TRIM(v_base_name);

      UPDATE open_packs
      SET remaining_units = LEAST(remaining_units + v_item.quantity, pack_size),
          is_empty = false,
          emptied_at = NULL
      WHERE id = (
        SELECT id FROM open_packs
        WHERE UPPER(product_name) LIKE '%' || v_base_name || '%'
        ORDER BY is_empty ASC, opened_at DESC
        LIMIT 1
      );
    END IF;

  END LOOP;

  -- Now delete items and order
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;
