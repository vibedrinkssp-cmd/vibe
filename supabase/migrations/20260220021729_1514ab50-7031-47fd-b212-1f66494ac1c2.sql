
-- RPC to update dose price on an open bottle (admin only)
CREATE OR REPLACE FUNCTION public.update_bottle_dose_price(
  p_bottle_id uuid,
  p_dose_price numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE open_bottles SET dose_price = p_dose_price WHERE id = p_bottle_id;
END;
$$;
