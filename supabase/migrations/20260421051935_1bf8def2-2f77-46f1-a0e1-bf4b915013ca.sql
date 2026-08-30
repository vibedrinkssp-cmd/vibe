
-- 1) Recria open_cigarette_pack: aceita quantidade variável e acresce no estoque do SOLTO
CREATE OR REPLACE FUNCTION public.open_cigarette_pack(
  p_product_id uuid,
  p_pack_size integer DEFAULT 20,
  p_opened_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_product_name text;
  v_stock integer;
  v_loose_name text;
  v_loose_id uuid;
BEGIN
  IF p_pack_size IS NULL OR p_pack_size < 1 THEN
    RAISE EXCEPTION 'Quantidade de cigarros inválida';
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

  -- Localiza o produto SOLTO equivalente (substitui MACO/MAÇO por SOLTO)
  v_loose_name := regexp_replace(upper(v_product_name), '\m(MACO|MAÇO)\M', 'SOLTO', 'g');
  SELECT id INTO v_loose_id
  FROM products
  WHERE upper(name) = v_loose_name
    AND is_active = true
  LIMIT 1;

  -- Se existir o produto SOLTO, acresce p_pack_size cigarros no estoque dele
  IF v_loose_id IS NOT NULL THEN
    UPDATE products
    SET stock = COALESCE(stock, 0) + p_pack_size
    WHERE id = v_loose_id;
  END IF;

  -- Cria registro de maço aberto
  INSERT INTO open_packs (product_id, product_name, pack_size, remaining_units, opened_by, notes)
  VALUES (p_product_id, v_product_name, p_pack_size, p_pack_size, p_opened_by, p_notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 2) renew_cigarette_pack agora aceita quantidade
CREATE OR REPLACE FUNCTION public.renew_cigarette_pack(
  p_pack_id uuid,
  p_opened_by text DEFAULT NULL,
  p_pack_size integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_old_size integer;
  v_size integer;
  v_new_id uuid;
BEGIN
  SELECT product_id, pack_size INTO v_product_id, v_old_size
  FROM open_packs WHERE id = p_pack_id;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Maço não encontrado';
  END IF;

  v_size := COALESCE(p_pack_size, v_old_size, 20);

  UPDATE open_packs
  SET is_empty = true,
      remaining_units = 0,
      emptied_at = COALESCE(emptied_at, now())
  WHERE id = p_pack_id;

  v_new_id := public.open_cigarette_pack(v_product_id, v_size, p_opened_by, 'Renovação');
  RETURN v_new_id;
END;
$$;

-- 3) Trigger: ao vender cigarro SOLTO, decrementa open_packs e estoque do produto SOLTO
CREATE OR REPLACE FUNCTION public.consume_loose_cigarette()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name text;
  v_product_type text;
  v_brand_prefix text;
  v_remaining integer;
  v_to_consume integer;
  v_pack_id uuid;
  v_pack_remaining integer;
  v_consumed integer;
BEGIN
  -- Só processa produtos cadastrados do tipo tabacaria com nome terminando em SOLTO
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, product_type INTO v_product_name, v_product_type
  FROM products WHERE id = NEW.product_id;

  IF v_product_type IS DISTINCT FROM 'tabacaria' THEN
    RETURN NEW;
  END IF;
  IF upper(v_product_name) !~ '\mSOLTO\M' THEN
    RETURN NEW;
  END IF;

  v_to_consume := NEW.quantity;

  -- Marca da família = nome sem a palavra SOLTO (para casar com MACO equivalente)
  v_brand_prefix := trim(regexp_replace(upper(v_product_name), '\mSOLTO\M', '', 'g'));

  -- Consome dos maços abertos mais antigos (FIFO) da MESMA marca
  v_consumed := 0;
  WHILE v_to_consume > 0 LOOP
    SELECT op.id, op.remaining_units
      INTO v_pack_id, v_pack_remaining
    FROM open_packs op
    JOIN products mp ON mp.id = op.product_id
    WHERE op.is_empty = false
      AND op.remaining_units > 0
      AND trim(regexp_replace(upper(mp.name), '\m(MACO|MAÇO)\M', '', 'g')) = v_brand_prefix
    ORDER BY op.opened_at ASC
    LIMIT 1;

    IF v_pack_id IS NULL THEN
      RAISE EXCEPTION 'Não há maço aberto suficiente para vender % cigarros de %. Abra um novo maço.',
        NEW.quantity, v_product_name;
    END IF;

    IF v_pack_remaining >= v_to_consume THEN
      UPDATE open_packs
      SET remaining_units = remaining_units - v_to_consume,
          is_empty = (remaining_units - v_to_consume) <= 0,
          emptied_at = CASE WHEN (remaining_units - v_to_consume) <= 0 THEN now() ELSE emptied_at END
      WHERE id = v_pack_id;
      v_consumed := v_consumed + v_to_consume;
      v_to_consume := 0;
    ELSE
      UPDATE open_packs
      SET remaining_units = 0,
          is_empty = true,
          emptied_at = now()
      WHERE id = v_pack_id;
      v_consumed := v_consumed + v_pack_remaining;
      v_to_consume := v_to_consume - v_pack_remaining;
    END IF;
  END LOOP;

  -- Decrementa estoque do produto SOLTO (espelha o consumo dos maços)
  UPDATE products
  SET stock = GREATEST(COALESCE(stock, 0) - NEW.quantity, 0)
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sell_loose_cigarette ON public.order_items;
CREATE TRIGGER trg_sell_loose_cigarette
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.consume_loose_cigarette();
