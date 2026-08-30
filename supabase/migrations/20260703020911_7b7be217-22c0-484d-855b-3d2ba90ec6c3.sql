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
    SET price_99food = ROUND(COALESCE(sale_price, 0) * (1 + p_percent / 100.0), 2)
    WHERE id IS NOT NULL;
  ELSIF p_platform = 'ifood' THEN
    UPDATE products
    SET price_ifood = ROUND(COALESCE(sale_price, 0) * (1 + p_percent / 100.0), 2)
    WHERE id IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;