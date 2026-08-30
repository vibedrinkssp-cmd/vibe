CREATE OR REPLACE FUNCTION public.renew_cigarette_pack(
  p_pack_id uuid,
  p_pack_size integer DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_opened_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_product_id uuid;
  v_old_pack_size integer;
  v_old_unit_price numeric;
  v_pack_size integer;
  v_unit_price numeric;
  v_sale_price numeric;
  v_new_pack_id uuid;
BEGIN
  SELECT product_id, pack_size, unit_price
    INTO v_old_product_id, v_old_pack_size, v_old_unit_price
  FROM open_packs WHERE id = p_pack_id;

  IF v_old_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço original não encontrado';
  END IF;

  v_pack_size := COALESCE(p_pack_size, v_old_pack_size, 20);
  IF v_pack_size <= 0 THEN
    RAISE EXCEPTION 'Tamanho do maço inválido';
  END IF;

  SELECT sale_price INTO v_sale_price FROM products WHERE id = v_old_product_id;

  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    IF v_sale_price IS NULL OR v_sale_price <= 0 THEN
      RAISE EXCEPTION 'Cadastre o preço de venda do maço em Produtos antes de renovar.';
    END IF;
    v_unit_price := ROUND( (v_sale_price / v_pack_size)::numeric, 2 );
    IF v_unit_price <= 0 THEN
      v_unit_price := 0.01;
    END IF;
  ELSE
    v_unit_price := ROUND(p_unit_price::numeric, 2);
  END IF;

  -- Cria o novo maço (decrementa 1 do estoque do produto MAÇO)
  v_new_pack_id := public.open_cigarette_pack(
    v_old_product_id, v_pack_size, v_unit_price, p_opened_by, NULL
  );

  -- Apaga o registro antigo para que não continue aparecendo na lista de vazios
  DELETE FROM open_packs WHERE id = p_pack_id;

  RETURN v_new_pack_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_cigarette_pack(uuid, integer, numeric, text) TO authenticated, anon, service_role;