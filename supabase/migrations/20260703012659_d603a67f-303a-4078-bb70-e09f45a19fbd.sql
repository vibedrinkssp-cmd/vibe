ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS on_99food boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS on_ifood boolean NOT NULL DEFAULT false;

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
  p_on_ifood boolean DEFAULT NULL::boolean
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
    on_ifood = COALESCE(p_on_ifood, on_ifood)
  WHERE id = p_id;
END;
$function$;