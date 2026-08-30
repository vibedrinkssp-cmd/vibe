CREATE OR REPLACE FUNCTION public.renew_cigarette_pack(p_pack_id uuid, p_pack_size integer DEFAULT NULL::integer, p_unit_price numeric DEFAULT NULL::numeric, p_opened_by text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pack RECORD;
  v_pack_size integer;
  v_unit_price numeric;
  v_sale_price numeric;
  v_dup_id uuid;
BEGIN
  SELECT * INTO v_pack FROM open_packs WHERE id = p_pack_id;

  IF v_pack.id IS NULL THEN
    RAISE EXCEPTION 'Maço original não encontrado';
  END IF;

  v_pack_size := COALESCE(p_pack_size, v_pack.pack_size, 20);
  IF v_pack_size <= 0 THEN
    RAISE EXCEPTION 'Tamanho do maço inválido';
  END IF;

  SELECT sale_price INTO v_sale_price FROM products WHERE id = v_pack.product_id;

  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    v_unit_price := COALESCE(NULLIF(v_pack.unit_price, 0), NULL);
    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      IF v_sale_price IS NULL OR v_sale_price <= 0 THEN
        RAISE EXCEPTION 'Cadastre o preço de venda do maço em Produtos antes de renovar.';
      END IF;
      v_unit_price := ROUND((v_sale_price / v_pack_size)::numeric, 2);
      IF v_unit_price <= 0 THEN
        v_unit_price := 0.01;
      END IF;
    END IF;
  ELSE
    v_unit_price := ROUND(p_unit_price::numeric, 2);
  END IF;

  -- Remove eventuais outros maços ATIVOS do mesmo produto para manter 1 ativo
  FOR v_dup_id IN
    SELECT id FROM open_packs
    WHERE product_id = v_pack.product_id
      AND is_empty = false
      AND id <> p_pack_id
  LOOP
    DELETE FROM open_packs WHERE id = v_dup_id;
  END LOOP;

  -- Reabastece o PRÓPRIO maço (não cria um novo, evitando acúmulo)
  UPDATE open_packs
  SET pack_size = v_pack_size,
      remaining_units = v_pack_size,
      unit_price = v_unit_price,
      is_empty = false,
      emptied_at = NULL,
      opened_at = now(),
      opened_by = COALESCE(p_opened_by, opened_by),
      notes = COALESCE(notes || ' | ', '') || '♻️ Renovado em ' || to_char(now(), 'DD/MM HH24:MI')
  WHERE id = p_pack_id;

  -- Baixa 1 unidade do estoque (um maço físico foi consumido)
  UPDATE products SET stock = GREATEST(0, COALESCE(stock,0) - 1) WHERE id = v_pack.product_id;

  RETURN p_pack_id;
END;
$function$;