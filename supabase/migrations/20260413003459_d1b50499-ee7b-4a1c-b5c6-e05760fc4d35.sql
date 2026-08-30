
-- Drop all overloaded versions
DROP FUNCTION IF EXISTS public.create_caderneta_entry(uuid, uuid, text, integer, numeric, numeric, text, text);
DROP FUNCTION IF EXISTS public.create_caderneta_entry(uuid, text, integer, numeric, numeric, uuid, text, text);

-- Recreate with single unambiguous signature
CREATE OR REPLACE FUNCTION public.create_caderneta_entry(
  p_customer_id uuid,
  p_product_name text,
  p_quantity integer,
  p_unit_price numeric,
  p_total_price numeric,
  p_product_id uuid DEFAULT NULL,
  p_salesperson text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_stock INTEGER;
  v_is_prepared BOOLEAN;
BEGIN
  IF p_product_id IS NOT NULL THEN
    SELECT stock, is_prepared INTO v_stock, v_is_prepared FROM products WHERE id = p_product_id;
    IF NOT COALESCE(v_is_prepared, false) THEN
      IF v_stock < p_quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', v_stock;
      END IF;
      UPDATE products SET stock = stock - p_quantity WHERE id = p_product_id;
    END IF;
  END IF;

  INSERT INTO caderneta_entries (customer_id, product_id, product_name, quantity, unit_price, total_price, salesperson, notes)
  VALUES (p_customer_id, p_product_id, p_product_name, p_quantity, p_unit_price, p_total_price, p_salesperson, p_notes)
  RETURNING id INTO v_id;

  RETURN v_id::text;
END;
$$;
