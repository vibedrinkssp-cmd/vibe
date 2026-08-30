
-- RPC to update a drink fruit (price and/or is_active)
CREATE OR REPLACE FUNCTION public.update_drink_fruit(
  p_id uuid,
  p_price numeric DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE drink_fruits
  SET
    price = COALESCE(p_price, price),
    is_active = COALESCE(p_is_active, is_active),
    name = COALESCE(p_name, name)
  WHERE id = p_id;
END;
$$;

-- RPC to create a drink fruit
CREATE OR REPLACE FUNCTION public.create_drink_fruit(
  p_name text,
  p_price numeric DEFAULT 5.00,
  p_sort_order integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO drink_fruits (name, price, sort_order)
  VALUES (p_name, p_price, p_sort_order)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC to delete a drink fruit
CREATE OR REPLACE FUNCTION public.delete_drink_fruit(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM drink_fruits WHERE id = p_id;
END;
$$;

-- RPC to get all drink fruits (including inactive, for admin)
CREATE OR REPLACE FUNCTION public.get_all_drink_fruits()
RETURNS SETOF drink_fruits
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM drink_fruits ORDER BY sort_order, name;
$$;
