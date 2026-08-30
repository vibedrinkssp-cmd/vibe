
-- 1. Ampliar dedução automática para caderneta e plataformas externas
CREATE OR REPLACE FUNCTION public.auto_deduct_cigarette_caderneta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_name text;
  v_base_name text;
  i integer;
BEGIN
  v_product_name := UPPER(TRIM(NEW.product_name));

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

    FOR i IN 1..NEW.quantity LOOP
      UPDATE open_packs
      SET remaining_units = remaining_units - 1,
          is_empty = CASE WHEN remaining_units - 1 <= 0 THEN true ELSE false END,
          emptied_at = CASE WHEN remaining_units - 1 <= 0 THEN now() ELSE NULL END
      WHERE id = (
        SELECT id FROM open_packs
        WHERE is_empty = false AND remaining_units > 0
          AND UPPER(product_name) LIKE '%' || v_base_name || '%'
        ORDER BY opened_at ASC
        LIMIT 1
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_deduct_cigarette_caderneta ON public.caderneta_entries;
CREATE TRIGGER trg_auto_deduct_cigarette_caderneta
AFTER INSERT ON public.caderneta_entries
FOR EACH ROW EXECUTE FUNCTION auto_deduct_cigarette_caderneta();

DROP TRIGGER IF EXISTS trg_auto_deduct_cigarette_platform ON public.platform_sales;
CREATE TRIGGER trg_auto_deduct_cigarette_platform
AFTER INSERT ON public.platform_sales
FOR EACH ROW EXECUTE FUNCTION auto_deduct_cigarette_caderneta();

-- 2. RPC para renovar maço (marca atual como vazio se ainda não estiver e abre novo)
CREATE OR REPLACE FUNCTION public.renew_cigarette_pack(p_pack_id uuid, p_opened_by text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_id uuid;
  v_pack_size integer;
  v_new_id uuid;
BEGIN
  SELECT product_id, pack_size INTO v_product_id, v_pack_size
  FROM open_packs WHERE id = p_pack_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço não encontrado';
  END IF;

  -- Marca o atual como vazio (caso ainda não esteja)
  UPDATE open_packs
  SET is_empty = true,
      remaining_units = 0,
      emptied_at = COALESCE(emptied_at, now())
  WHERE id = p_pack_id;

  -- Abre um novo do mesmo produto
  v_new_id := public.open_cigarette_pack(v_product_id, v_pack_size, p_opened_by, 'Renovação automática');

  RETURN v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.renew_cigarette_pack(uuid, text) TO authenticated, anon;
