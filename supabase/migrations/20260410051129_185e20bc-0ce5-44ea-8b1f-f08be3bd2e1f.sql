CREATE OR REPLACE FUNCTION public.update_product(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_cost_price numeric DEFAULT NULL,
  p_profit_margin numeric DEFAULT NULL,
  p_sale_price numeric DEFAULT NULL,
  p_stock integer DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_tier product_tier DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    category_id = COALESCE(p_category_id, category_id),
    cost_price = COALESCE(p_cost_price, cost_price),
    profit_margin = COALESCE(p_profit_margin, profit_margin),
    sale_price = COALESCE(p_sale_price, sale_price),
    stock = COALESCE(p_stock, stock),
    image_url = COALESCE(p_image_url, image_url),
    is_active = COALESCE(p_is_active, is_active),
    tier = COALESCE(p_tier, tier)
  WHERE id = p_id;
END;
$$;