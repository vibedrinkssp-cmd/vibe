
CREATE OR REPLACE FUNCTION public.toggle_fruit_availability(p_fruit_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE drink_fruits SET is_active = p_is_active WHERE id = p_fruit_id;
END;
$$;
