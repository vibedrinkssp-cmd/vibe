
CREATE OR REPLACE FUNCTION public.motoboy_heartbeat(p_motoboy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE motoboys
  SET location_updated_at = now()
  WHERE id = p_motoboy_id;
END;
$$;
