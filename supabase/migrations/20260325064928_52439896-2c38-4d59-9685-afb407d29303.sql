DROP FUNCTION IF EXISTS public.get_available_bottles_for_assembly();

CREATE FUNCTION public.get_available_bottles_for_assembly()
RETURNS TABLE(bottle_id uuid, product_id uuid, product_name text, dose_price numeric, remaining_doses integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ob.id AS bottle_id,
    ob.product_id,
    ob.product_name,
    ob.dose_price,
    ob.remaining_doses
  FROM open_bottles ob
  WHERE ob.is_empty = false
    AND ob.remaining_doses > 0
    AND ob.dose_price > 0
  ORDER BY ob.product_name;
END;
$$;