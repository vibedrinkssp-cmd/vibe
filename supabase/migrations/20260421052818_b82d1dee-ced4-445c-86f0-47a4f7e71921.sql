CREATE OR REPLACE FUNCTION public.get_available_bottles_for_assembly()
RETURNS TABLE(bottle_id uuid, product_id uuid, product_name text, dose_price numeric, remaining_doses integer, tier product_tier, image_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ob.id AS bottle_id,
    ob.product_id,
    ob.product_name,
    ob.dose_price,
    ob.remaining_doses,
    p.tier,
    p.image_url
  FROM open_bottles ob
  LEFT JOIN products p ON p.id = ob.product_id
  WHERE ob.is_empty = false
    AND ob.remaining_doses > 0
    AND (
      ob.dose_price > 0
      OR p.product_type = 'energetico'
    )
  ORDER BY ob.product_name;
END;
$function$;