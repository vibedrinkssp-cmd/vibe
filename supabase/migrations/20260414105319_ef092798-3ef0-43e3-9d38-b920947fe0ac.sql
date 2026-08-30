CREATE OR REPLACE FUNCTION public.clone_product(
  p_product_id uuid,
  p_new_image_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_id UUID;
  src RECORD;
BEGIN
  SELECT * INTO src FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;

  INSERT INTO products (
    name, description, category_id, cost_price, profit_margin,
    sale_price, stock, image_url, is_active, sort_order,
    is_prepared, combo_eligible, barcode, product_type, tier
  ) VALUES (
    src.name || ' (CÓPIA)',
    src.description,
    src.category_id,
    src.cost_price,
    src.profit_margin,
    src.sale_price,
    src.stock,
    COALESCE(p_new_image_url, src.image_url),
    src.is_active,
    src.sort_order,
    src.is_prepared,
    src.combo_eligible,
    NULL, -- barcode must be unique
    src.product_type,
    src.tier
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;