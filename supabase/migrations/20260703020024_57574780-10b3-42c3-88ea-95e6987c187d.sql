-- Add editable external platform prices
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price_99food numeric,
  ADD COLUMN IF NOT EXISTS price_ifood numeric;

-- Extend update_product to accept the new platform prices
CREATE OR REPLACE FUNCTION public.update_product(
  p_id uuid,
  p_name text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid,
  p_cost_price numeric DEFAULT NULL::numeric,
  p_profit_margin numeric DEFAULT NULL::numeric,
  p_sale_price numeric DEFAULT NULL::numeric,
  p_stock integer DEFAULT NULL::integer,
  p_image_url text DEFAULT NULL::text,
  p_is_active boolean DEFAULT NULL::boolean,
  p_tier product_tier DEFAULT NULL::product_tier,
  p_on_99food boolean DEFAULT NULL::boolean,
  p_on_ifood boolean DEFAULT NULL::boolean,
  p_price_99food numeric DEFAULT NULL::numeric,
  p_price_ifood numeric DEFAULT NULL::numeric
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    tier = COALESCE(p_tier, tier),
    on_99food = COALESCE(p_on_99food, on_99food),
    on_ifood = COALESCE(p_on_ifood, on_ifood),
    price_99food = COALESCE(p_price_99food, price_99food),
    price_ifood = COALESCE(p_price_ifood, price_ifood)
  WHERE id = p_id;
END;
$function$;

-- Bulk-apply a percentage markup over sale_price to every product for a platform
CREATE OR REPLACE FUNCTION public.apply_platform_price_markup(
  p_platform text,
  p_percent numeric
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected integer;
BEGIN
  IF p_platform = '99food' THEN
    UPDATE products
    SET price_99food = ROUND(COALESCE(sale_price, 0) * (1 + p_percent / 100.0), 2);
  ELSIF p_platform = 'ifood' THEN
    UPDATE products
    SET price_ifood = ROUND(COALESCE(sale_price, 0) * (1 + p_percent / 100.0), 2);
  ELSE
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;