
-- Add is_online and logged_in_at columns to motoboys
ALTER TABLE public.motoboys ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
ALTER TABLE public.motoboys ADD COLUMN IF NOT EXISTS logged_in_at timestamp with time zone;

-- RPC to set motoboy online/offline status
CREATE OR REPLACE FUNCTION public.set_motoboy_online_status(
  p_motoboy_id uuid,
  p_is_online boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE motoboys
  SET 
    is_online = p_is_online,
    logged_in_at = CASE WHEN p_is_online AND logged_in_at IS NULL THEN now() ELSE logged_in_at END,
    location_updated_at = CASE WHEN p_is_online THEN now() ELSE location_updated_at END
  WHERE id = p_motoboy_id;
END;
$$;

-- Grant access to anon (custom auth system)
GRANT EXECUTE ON FUNCTION public.set_motoboy_online_status(uuid, boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.set_motoboy_online_status(uuid, boolean) TO authenticated;

-- RPC to get only online motoboys for admin assignment
CREATE OR REPLACE FUNCTION public.get_online_motoboys()
RETURNS SETOF motoboys
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM motoboys 
  WHERE is_active = true 
    AND is_online = true
    AND location_updated_at > now() - interval '10 minutes'
  ORDER BY name;
$$;

GRANT EXECUTE ON FUNCTION public.get_online_motoboys() TO anon;
GRANT EXECUTE ON FUNCTION public.get_online_motoboys() TO authenticated;

-- Update motoboy_heartbeat to also set is_online true
CREATE OR REPLACE FUNCTION public.motoboy_heartbeat(p_motoboy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE motoboys
  SET location_updated_at = now(),
      is_online = true
  WHERE id = p_motoboy_id;
END;
$$;
