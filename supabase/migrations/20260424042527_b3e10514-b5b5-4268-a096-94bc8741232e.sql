
-- 1) Backfill: maços abertos sem preço herdam o preço do produto / pack_size
UPDATE public.open_packs p
SET unit_price = ROUND( (pr.sale_price / NULLIF(p.pack_size,0))::numeric, 2 )
FROM public.products pr
WHERE pr.id = p.product_id
  AND p.is_empty = false
  AND (p.unit_price IS NULL OR p.unit_price <= 0)
  AND pr.sale_price > 0;

-- 2) Limpar funções legadas (defesa em profundidade)
DROP FUNCTION IF EXISTS public.auto_deduct_cigarette_caderneta() CASCADE;
DROP FUNCTION IF EXISTS public.auto_deduct_cigarette_on_sale() CASCADE;

-- 3) Redefinir open_cigarette_pack: preço sempre coerente com o cadastro
CREATE OR REPLACE FUNCTION public.open_cigarette_pack(
  p_product_id uuid,
  p_pack_size integer DEFAULT 20,
  p_unit_price numeric DEFAULT 0,
  p_opened_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name text;
  v_sale_price numeric;
  v_unit_price numeric;
  v_pack_id uuid;
BEGIN
  IF p_pack_size IS NULL OR p_pack_size <= 0 THEN
    RAISE EXCEPTION 'Tamanho do maço inválido';
  END IF;

  SELECT name, sale_price INTO v_product_name, v_sale_price
  FROM products WHERE id = p_product_id;

  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  -- Regra única: se operador não passou (0/null), calcula do cadastro.
  -- Se passou um valor, exige > 0.
  IF p_unit_price IS NULL OR p_unit_price <= 0 THEN
    IF v_sale_price IS NULL OR v_sale_price <= 0 THEN
      RAISE EXCEPTION 'Cadastre o preço de venda do maço em Produtos antes de abrir.';
    END IF;
    v_unit_price := ROUND( (v_sale_price / p_pack_size)::numeric, 2 );
    IF v_unit_price <= 0 THEN
      v_unit_price := 0.01;
    END IF;
  ELSE
    v_unit_price := ROUND(p_unit_price::numeric, 2);
  END IF;

  INSERT INTO open_packs (
    product_id, product_name, pack_size, remaining_units,
    unit_price, opened_by, notes, opened_at, is_empty
  ) VALUES (
    p_product_id, v_product_name, p_pack_size, p_pack_size,
    v_unit_price, p_opened_by, p_notes, now(), false
  )
  RETURNING id INTO v_pack_id;

  RETURN v_pack_id;
END;
$$;

-- 4) Redefinir renew_cigarette_pack com mesma regra
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

  -- Regra única de preço: se nada foi passado, recalcula do cadastro.
  -- Se passado, exige > 0.
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

  -- Marca o antigo como vazio (caso ainda não esteja)
  UPDATE open_packs
     SET is_empty = true,
         remaining_units = 0,
         emptied_at = COALESCE(emptied_at, now())
   WHERE id = p_pack_id AND is_empty = false;

  -- Cria o novo maço
  v_new_pack_id := open_cigarette_pack(
    v_old_product_id, v_pack_size, v_unit_price, p_opened_by, NULL
  );

  RETURN v_new_pack_id;
END;
$$;

-- 5) Endurecer sell_loose_cigarette: rejeita venda de maço sem preço
CREATE OR REPLACE FUNCTION public.sell_loose_cigarette(p_pack_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_remaining integer;
  v_unit_price numeric;
  v_to_consume integer;
  v_current_pack uuid;
  v_current_remaining integer;
  v_current_price numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  SELECT product_id, remaining_units, unit_price
    INTO v_product_id, v_remaining, v_unit_price
  FROM open_packs WHERE id = p_pack_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço não encontrado';
  END IF;

  IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
    RAISE EXCEPTION 'Maço sem preço unitário configurado. Edite o preço no Admin/Maços antes de vender.';
  END IF;

  v_to_consume := p_quantity;

  WHILE v_to_consume > 0 LOOP
    SELECT id, remaining_units, unit_price
      INTO v_current_pack, v_current_remaining, v_current_price
      FROM open_packs
     WHERE product_id = v_product_id
       AND is_empty = false
       AND remaining_units > 0
     ORDER BY (id = p_pack_id) DESC, opened_at ASC
     LIMIT 1;

    IF v_current_pack IS NULL THEN
      RAISE EXCEPTION 'Estoque de cigarros soltos insuficiente. Abra um novo maço.';
    END IF;

    IF v_current_price IS NULL OR v_current_price <= 0 THEN
      RAISE EXCEPTION 'Maço sem preço unitário configurado (FIFO). Configure o preço antes de vender.';
    END IF;

    IF v_current_remaining >= v_to_consume THEN
      UPDATE open_packs
         SET remaining_units = remaining_units - v_to_consume,
             is_empty = (remaining_units - v_to_consume) <= 0,
             emptied_at = CASE WHEN (remaining_units - v_to_consume) <= 0 THEN now() ELSE emptied_at END
       WHERE id = v_current_pack;
      v_to_consume := 0;
    ELSE
      UPDATE open_packs
         SET remaining_units = 0,
             is_empty = true,
             emptied_at = now()
       WHERE id = v_current_pack;
      v_to_consume := v_to_consume - v_current_remaining;
    END IF;
  END LOOP;
END;
$$;

-- 6) Habilitar realtime em open_packs (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'open_packs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.open_packs';
  END IF;
END $$;

ALTER TABLE public.open_packs REPLICA IDENTITY FULL;
