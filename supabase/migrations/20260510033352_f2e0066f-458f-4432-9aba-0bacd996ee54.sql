CREATE OR REPLACE FUNCTION public.get_order_latest_motoboy_location(
  p_user_id uuid,
  p_order_id uuid
)
RETURNS TABLE(
  latitude numeric,
  longitude numeric,
  updated_at timestamptz,
  motoboy_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motoboy_id uuid;
BEGIN
  SELECT o.motoboy_id INTO v_motoboy_id
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.user_id = p_user_id
    AND o.order_type = 'delivery'
    AND o.status IN ('dispatched', 'arrived')
  LIMIT 1;

  IF v_motoboy_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ml.latitude, ml.longitude, ml.created_at AS updated_at, ml.motoboy_id
  FROM public.motoboy_locations ml
  WHERE ml.motoboy_id = v_motoboy_id
  ORDER BY
    CASE WHEN ml.order_id = p_order_id THEN 0 ELSE 1 END,
    ml.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT m.current_latitude, m.current_longitude, m.location_updated_at, m.id
    FROM public.motoboys m
    WHERE m.id = v_motoboy_id
      AND m.current_latitude IS NOT NULL
      AND m.current_longitude IS NOT NULL
    LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_latest_motoboy_location(uuid, uuid) TO anon, authenticated;