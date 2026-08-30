CREATE OR REPLACE FUNCTION public.round_platform_prices(
  p_platform text
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
    SET price_99food = CASE
      WHEN COALESCE(price_99food, 0) <= 0 THEN price_99food
      WHEN price_99food <= floor(price_99food) + 0.49 THEN floor(price_99food) + 0.49
      WHEN price_99food <= floor(price_99food) + 0.90 THEN floor(price_99food) + 0.90
      ELSE floor(price_99food) + 1 + 0.49
    END
    WHERE id IS NOT NULL AND price_99food IS NOT NULL;
  ELSIF p_platform = 'ifood' THEN
    UPDATE products
    SET price_ifood = CASE
      WHEN COALESCE(price_ifood, 0) <= 0 THEN price_ifood
      WHEN price_ifood <= floor(price_ifood) + 0.49 THEN floor(price_ifood) + 0.49
      WHEN price_ifood <= floor(price_ifood) + 0.90 THEN floor(price_ifood) + 0.90
      ELSE floor(price_ifood) + 1 + 0.49
    END
    WHERE id IS NOT NULL AND price_ifood IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Invalid platform: %', p_platform;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;