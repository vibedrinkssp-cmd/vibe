CREATE OR REPLACE FUNCTION public.update_motoboy_location(
  p_motoboy_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_order_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_motoboy_id IS NULL THEN
    RAISE EXCEPTION 'Motoboy inválido';
  END IF;

  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'Coordenadas inválidas';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.motoboys
    WHERE id = p_motoboy_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;

  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id
      AND motoboy_id = p_motoboy_id
      AND status IN ('accepted', 'preparing', 'ready', 'dispatched', 'arrived')
  ) THEN
    RAISE EXCEPTION 'Pedido não atribuído a este motoboy';
  END IF;

  UPDATE public.motoboys
  SET
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    location_updated_at = now(),
    is_online = true
  WHERE id = p_motoboy_id;

  INSERT INTO public.motoboy_locations (motoboy_id, order_id, latitude, longitude)
  VALUES (p_motoboy_id, p_order_id, p_latitude, p_longitude);
END;
$$;

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
    AND (ml.order_id = p_order_id OR ml.order_id IS NULL)
  ORDER BY
    CASE WHEN ml.order_id = p_order_id THEN 0 ELSE 1 END,
    ml.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_motoboy_location(uuid, numeric, numeric, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_latest_motoboy_location(uuid, uuid) TO anon, authenticated;