
-- Função utilitária para abrir energéticos 2L com config padrão (2000ml / 400ml por dose = 5 doses)
CREATE OR REPLACE FUNCTION public.open_energy_drink_2l(p_product_id uuid, p_opened_by text DEFAULT 'Sistema')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product RECORD;
  v_existing_id uuid;
  v_bottle_id uuid;
BEGIN
  SELECT id, name, sale_price, COALESCE(stock,0) AS stock
    INTO v_product
  FROM products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  -- Se já existe garrafa ativa desse energético, retorna ela (idempotente)
  SELECT id INTO v_existing_id
  FROM open_bottles
  WHERE product_id = p_product_id AND is_empty = false
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Cria nova garrafa com config padrão de energético 2L
  INSERT INTO open_bottles (
    product_id, product_name, total_ml, ml_per_dose,
    total_doses, remaining_doses, opened_by, notes, dose_price
  ) VALUES (
    v_product.id, v_product.name, 2000, 400, 5, 5,
    p_opened_by,
    'Energético 2L: 5 doses de 400ml',
    COALESCE(v_product.sale_price, 10) / 5
  )
  RETURNING id INTO v_bottle_id;

  -- Decrementa 1 do estoque físico
  UPDATE products
  SET stock = GREATEST(0, COALESCE(stock,0) - 1)
  WHERE id = v_product.id;

  RETURN v_bottle_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_energy_drink_2l(uuid, text) TO authenticated, anon;
