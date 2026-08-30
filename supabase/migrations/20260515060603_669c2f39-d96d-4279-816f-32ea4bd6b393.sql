
CREATE OR REPLACE FUNCTION public.auto_consume_energy_dose(
  p_product_id uuid,
  p_doses integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER := p_doses;
  v_bottle RECORD;
  v_take INTEGER;
  v_stock INTEGER;
  v_product_name TEXT;
  v_opened_bottles INTEGER := 0;
BEGIN
  IF p_doses IS NULL OR p_doses <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'doses_consumed', 0, 'auto_opened', 0);
  END IF;

  SELECT name, COALESCE(stock, 0) INTO v_product_name, v_stock
  FROM products WHERE id = p_product_id FOR UPDATE;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  WHILE v_remaining > 0 LOOP
    -- Pega a garrafa aberta FIFO mais antiga (não vazia) para esse produto
    SELECT id, remaining_doses INTO v_bottle
    FROM open_bottles
    WHERE product_id = p_product_id
      AND is_empty = false
      AND remaining_doses > 0
    ORDER BY opened_at ASC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      -- Nenhuma garrafa aberta: abre uma nova do estoque
      IF v_stock <= 0 THEN
        RAISE EXCEPTION 'Sem estoque de % para abrir nova garrafa', v_product_name;
      END IF;

      INSERT INTO open_bottles (
        product_id, product_name, total_ml, ml_per_dose,
        total_doses, remaining_doses, opened_by, notes, dose_price
      ) VALUES (
        p_product_id, v_product_name, 2000, 400,
        5, 5, '🤖 Auto', 'Aberta automaticamente ao consumir dose de energético', 0
      )
      RETURNING id, remaining_doses INTO v_bottle;

      UPDATE products SET stock = GREATEST(0, COALESCE(stock, 0) - 1) WHERE id = p_product_id;
      v_stock := v_stock - 1;
      v_opened_bottles := v_opened_bottles + 1;
    END IF;

    v_take := LEAST(v_remaining, v_bottle.remaining_doses);

    UPDATE open_bottles
    SET remaining_doses = remaining_doses - v_take,
        is_empty       = (remaining_doses - v_take) <= 0,
        emptied_at     = CASE WHEN (remaining_doses - v_take) <= 0 THEN now() ELSE emptied_at END
    WHERE id = v_bottle.id;

    v_remaining := v_remaining - v_take;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'doses_consumed', p_doses,
    'auto_opened', v_opened_bottles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_consume_energy_dose(uuid, integer) TO authenticated, anon;
