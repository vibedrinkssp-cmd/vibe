
-- Step 1: Clean all products and categories
DELETE FROM order_items WHERE product_id IS NOT NULL;
DELETE FROM platform_sales WHERE product_id IS NOT NULL;
DELETE FROM caderneta_entries WHERE product_id IS NOT NULL;
DELETE FROM sangria_items WHERE product_id IS NOT NULL;
DELETE FROM open_bottles;
DELETE FROM products;
DELETE FROM categories;

-- Step 2: Insert the 19 categories from CSV
INSERT INTO categories (name, sort_order, is_active, is_special) VALUES
  ('Ices', 1, true, false),
  ('Cervejas', 2, true, false),
  ('Energéticos', 3, true, false),
  ('Vodkas', 4, true, false),
  ('Whiskys', 5, true, false),
  ('Gins', 6, true, false),
  ('Vinhos', 7, true, false),
  ('Cachaças', 8, true, false),
  ('Licores', 9, true, false),
  ('Refrigerantes', 10, true, false),
  ('Sucos', 11, true, false),
  ('Água', 12, true, false),
  ('Gelos', 13, true, false),
  ('Doces', 14, true, false),
  ('Salgadinhos', 15, true, false),
  ('Diversos', 16, true, false),
  ('Tabacaria e Cigarros', 17, true, false),
  ('Caipi Ice', 18, true, true),
  ('Corotes Drinks', 19, true, true);

-- Step 3: Update import_products_batch to support cost_price and profit_margin
CREATE OR REPLACE FUNCTION import_products_batch(p_products jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product jsonb;
  cat_id uuid;
  cnt integer := 0;
BEGIN
  FOR product IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    -- Find or create category
    SELECT id INTO cat_id FROM categories WHERE name = product->>'category_name';
    IF cat_id IS NULL THEN
      INSERT INTO categories (name, is_active) VALUES (product->>'category_name', true)
      RETURNING id INTO cat_id;
    END IF;

    -- Insert product
    INSERT INTO products (
      name, description, sale_price, cost_price, profit_margin,
      stock, is_active, is_prepared, category_id
    ) VALUES (
      product->>'name',
      product->>'description',
      (product->>'sale_price')::numeric,
      COALESCE((product->>'cost_price')::numeric, 0),
      COALESCE((product->>'profit_margin')::numeric, 0),
      10,
      COALESCE((product->>'is_active')::boolean, true),
      COALESCE((product->>'is_prepared')::boolean, false),
      cat_id
    )
    ON CONFLICT DO NOTHING;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;
