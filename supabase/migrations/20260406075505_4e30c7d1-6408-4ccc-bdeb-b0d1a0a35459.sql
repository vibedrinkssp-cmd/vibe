CREATE INDEX IF NOT EXISTS idx_special_drink_recipes_product_id ON public.special_drink_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_special_drink_recipes_ingredient_product_id ON public.special_drink_recipes(ingredient_product_id);
CREATE INDEX IF NOT EXISTS idx_open_bottles_product_opened_at ON public.open_bottles(product_id, is_empty, opened_at);

CREATE OR REPLACE FUNCTION public.get_special_drink_recipes_admin(
  p_session_token text,
  p_product_id uuid DEFAULT NULL
)
RETURNS SETOF public.special_drink_recipes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.validate_session(p_session_token) s
  WHERE s.is_valid = true
    AND s.role = 'admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão administrativa inválida';
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.special_drink_recipes r
  WHERE p_product_id IS NULL OR r.product_id = p_product_id
  ORDER BY r.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_special_drink_recipe_admin(
  p_session_token text,
  p_product_id uuid,
  p_ingredient_type text,
  p_ingredient_product_id uuid DEFAULT NULL,
  p_bottle_product_name text DEFAULT NULL,
  p_quantity integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
  v_bottle_name text;
BEGIN
  PERFORM 1
  FROM public.validate_session(p_session_token) s
  WHERE s.is_valid = true
    AND s.role = 'admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão administrativa inválida';
  END IF;

  IF p_ingredient_type NOT IN ('dose', 'product') THEN
    RAISE EXCEPTION 'Tipo de ingrediente inválido';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  PERFORM 1
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink especial não encontrado';
  END IF;

  IF p_ingredient_product_id IS NOT NULL THEN
    SELECT name INTO v_bottle_name
    FROM public.products
    WHERE id = p_ingredient_product_id;

    IF v_bottle_name IS NULL THEN
      RAISE EXCEPTION 'Ingrediente não encontrado';
    END IF;
  END IF;

  IF p_ingredient_type = 'dose' THEN
    v_bottle_name := COALESCE(NULLIF(BTRIM(p_bottle_product_name), ''), v_bottle_name);

    IF v_bottle_name IS NULL THEN
      RAISE EXCEPTION 'Ingrediente de dose precisa de um produto vinculado';
    END IF;
  ELSE
    v_bottle_name := NULL;

    IF p_ingredient_product_id IS NULL THEN
      RAISE EXCEPTION 'Ingrediente de estoque precisa de um produto vinculado';
    END IF;
  END IF;

  INSERT INTO public.special_drink_recipes (
    product_id,
    ingredient_product_id,
    bottle_product_name,
    ingredient_type,
    quantity
  )
  VALUES (
    p_product_id,
    p_ingredient_product_id,
    v_bottle_name,
    p_ingredient_type,
    p_quantity
  )
  RETURNING id INTO v_recipe_id;

  RETURN v_recipe_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_special_drink_recipe_admin(
  p_session_token text,
  p_recipe_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.validate_session(p_session_token) s
  WHERE s.is_valid = true
    AND s.role = 'admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão administrativa inválida';
  END IF;

  DELETE FROM public.special_drink_recipes
  WHERE id = p_recipe_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ingrediente da receita não encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_special_drink_image_admin(
  p_session_token text,
  p_product_id uuid,
  p_image_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.validate_session(p_session_token) s
  WHERE s.is_valid = true
    AND s.role = 'admin';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão administrativa inválida';
  END IF;

  UPDATE public.products
  SET image_url = p_image_url
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Drink especial não encontrado';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_special_drink_stock(
  p_product_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipe RECORD;
  bottle RECORD;
  v_needed integer;
  v_available_doses integer;
  v_product_stock integer;
  v_ingredient_product_id uuid;
  v_ingredient_name text;
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Drink especial inválido';
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  FOR recipe IN
    SELECT *
    FROM public.special_drink_recipes
    WHERE product_id = p_product_id
    ORDER BY created_at ASC
  LOOP
    v_needed := recipe.quantity * p_quantity;
    v_ingredient_product_id := recipe.ingredient_product_id;
    v_ingredient_name := recipe.bottle_product_name;

    IF recipe.ingredient_type = 'dose' THEN
      IF v_ingredient_product_id IS NULL AND v_ingredient_name IS NOT NULL THEN
        SELECT p.id, p.name
        INTO v_ingredient_product_id, v_ingredient_name
        FROM public.products p
        WHERE p.name ILIKE v_ingredient_name
        ORDER BY p.is_active DESC, p.created_at DESC
        LIMIT 1;
      END IF;

      IF v_ingredient_product_id IS NULL THEN
        RAISE EXCEPTION 'Receita de drink especial com dose sem produto vinculado';
      END IF;

      SELECT COALESCE(SUM(ob.remaining_doses), 0)
      INTO v_available_doses
      FROM public.open_bottles ob
      WHERE ob.product_id = v_ingredient_product_id
        AND ob.is_empty = false
        AND ob.remaining_doses > 0;

      IF v_available_doses < v_needed THEN
        RAISE EXCEPTION 'Doses insuficientes para %: necessário %, disponível %', COALESCE(v_ingredient_name, 'ingrediente'), v_needed, v_available_doses;
      END IF;

      FOR bottle IN
        SELECT ob.id, ob.remaining_doses
        FROM public.open_bottles ob
        WHERE ob.product_id = v_ingredient_product_id
          AND ob.is_empty = false
          AND ob.remaining_doses > 0
        ORDER BY ob.opened_at ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_needed <= 0;

        IF bottle.remaining_doses >= v_needed THEN
          UPDATE public.open_bottles
          SET remaining_doses = remaining_doses - v_needed,
              is_empty = CASE WHEN remaining_doses - v_needed <= 0 THEN true ELSE false END,
              emptied_at = CASE WHEN remaining_doses - v_needed <= 0 THEN now() ELSE emptied_at END
          WHERE id = bottle.id;

          v_needed := 0;
        ELSE
          v_needed := v_needed - bottle.remaining_doses;

          UPDATE public.open_bottles
          SET remaining_doses = 0,
              is_empty = true,
              emptied_at = now()
          WHERE id = bottle.id;
        END IF;
      END LOOP;

    ELSIF recipe.ingredient_type = 'product' THEN
      IF v_ingredient_product_id IS NULL THEN
        RAISE EXCEPTION 'Receita de drink especial com item de estoque sem produto vinculado';
      END IF;

      SELECT stock, name
      INTO v_product_stock, v_ingredient_name
      FROM public.products
      WHERE id = v_ingredient_product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Ingrediente de estoque não encontrado';
      END IF;

      IF COALESCE(v_product_stock, 0) < v_needed THEN
        RAISE EXCEPTION 'Estoque insuficiente para %: necessário %, disponível %', COALESCE(v_ingredient_name, 'ingrediente'), v_needed, COALESCE(v_product_stock, 0);
      END IF;

      UPDATE public.products
      SET stock = COALESCE(stock, 0) - v_needed
      WHERE id = v_ingredient_product_id;
    ELSE
      RAISE EXCEPTION 'Tipo de ingrediente inválido na receita: %', recipe.ingredient_type;
    END IF;
  END LOOP;
END;
$$;