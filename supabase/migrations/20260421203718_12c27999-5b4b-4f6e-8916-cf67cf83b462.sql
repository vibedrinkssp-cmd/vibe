
-- =========================================================
-- REFATORAÇÃO: Cigarros Soltos = Maço Aberto (fonte única)
-- =========================================================

-- 1) Schema: open_packs ganha unit_price (preço do cigarro solto)
ALTER TABLE public.open_packs
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;

-- 2) Drop de triggers/funções legadas (consumiam produto SOLTO)
DROP TRIGGER IF EXISTS trg_sell_loose_cigarette ON public.order_items;
DROP TRIGGER IF EXISTS trg_auto_deduct_cigarette ON public.order_items;
DROP TRIGGER IF EXISTS trg_auto_deduct_cigarette_caderneta ON public.caderneta_entries;
DROP TRIGGER IF EXISTS trg_auto_deduct_cigarette_platform ON public.platform_sales;
DROP FUNCTION IF EXISTS public.consume_loose_cigarette() CASCADE;
DROP FUNCTION IF EXISTS public.auto_deduct_cigarette_on_sale() CASCADE;
DROP FUNCTION IF EXISTS public.auto_deduct_cigarette_caderneta() CASCADE;

-- 3) get_open_packs precisa retornar unit_price (o RETURNS SETOF open_packs já cobre, basta recriar)
CREATE OR REPLACE FUNCTION public.get_open_packs()
RETURNS SETOF public.open_packs
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.open_packs ORDER BY is_empty ASC, opened_at DESC;
$$;

-- 4) open_cigarette_pack — agora recebe unit_price e NÃO mexe em produto SOLTO
DROP FUNCTION IF EXISTS public.open_cigarette_pack(uuid, integer, text, text);
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
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_product_name text;
  v_stock integer;
BEGIN
  IF p_pack_size IS NULL OR p_pack_size < 1 THEN
    RAISE EXCEPTION 'Quantidade de cigarros inválida';
  END IF;
  IF p_unit_price IS NULL OR p_unit_price < 0 THEN
    RAISE EXCEPTION 'Preço unitário inválido';
  END IF;

  SELECT name, stock INTO v_product_name, v_stock FROM products WHERE id = p_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_stock IS NULL OR v_stock < 1 THEN
    RAISE EXCEPTION 'Estoque insuficiente para abrir maço';
  END IF;

  -- Deduz 1 maço do estoque do produto MAÇO
  UPDATE products SET stock = stock - 1 WHERE id = p_product_id;

  -- Cria o maço aberto (fonte única dos cigarros soltos)
  INSERT INTO open_packs (
    product_id, product_name, pack_size, remaining_units, unit_price, opened_by, notes
  ) VALUES (
    p_product_id, v_product_name, p_pack_size, p_pack_size, p_unit_price, p_opened_by, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 5) renew_cigarette_pack — pede pack_size + unit_price
DROP FUNCTION IF EXISTS public.renew_cigarette_pack(uuid, text);
DROP FUNCTION IF EXISTS public.renew_cigarette_pack(uuid, text, integer);
CREATE OR REPLACE FUNCTION public.renew_cigarette_pack(
  p_pack_id uuid,
  p_pack_size integer DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL,
  p_opened_by text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_id uuid;
  v_pack_size integer;
  v_unit_price numeric;
  v_new_id uuid;
BEGIN
  SELECT product_id,
         COALESCE(p_pack_size, pack_size, 20),
         COALESCE(p_unit_price, unit_price, 0)
    INTO v_product_id, v_pack_size, v_unit_price
  FROM open_packs WHERE id = p_pack_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço não encontrado';
  END IF;

  -- Marca o atual como vazio
  UPDATE open_packs
     SET remaining_units = 0,
         is_empty = true,
         emptied_at = COALESCE(emptied_at, now())
   WHERE id = p_pack_id;

  -- Abre um novo maço com os novos parâmetros
  v_new_id := public.open_cigarette_pack(v_product_id, v_pack_size, v_unit_price, p_opened_by, NULL);
  RETURN v_new_id;
END;
$$;

-- 6) sell_loose_cigarette — consome FIFO entre maços do mesmo produto
CREATE OR REPLACE FUNCTION public.sell_loose_cigarette(
  p_pack_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_id uuid;
  v_remaining integer;
  v_to_consume integer;
  v_current_pack uuid;
  v_current_remaining integer;
BEGIN
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  SELECT product_id, remaining_units INTO v_product_id, v_remaining
  FROM open_packs WHERE id = p_pack_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço não encontrado';
  END IF;

  v_to_consume := p_quantity;

  -- FIFO entre maços ABERTOS do MESMO produto (começando pelo selecionado)
  WHILE v_to_consume > 0 LOOP
    SELECT id, remaining_units
      INTO v_current_pack, v_current_remaining
      FROM open_packs
     WHERE product_id = v_product_id
       AND is_empty = false
       AND remaining_units > 0
     ORDER BY (id = p_pack_id) DESC, opened_at ASC
     LIMIT 1;

    IF v_current_pack IS NULL THEN
      RAISE EXCEPTION 'Estoque de cigarros soltos insuficiente. Abra um novo maço.';
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

GRANT EXECUTE ON FUNCTION public.sell_loose_cigarette(uuid, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.open_cigarette_pack(uuid, integer, numeric, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.renew_cigarette_pack(uuid, integer, numeric, text) TO authenticated, anon, service_role;
