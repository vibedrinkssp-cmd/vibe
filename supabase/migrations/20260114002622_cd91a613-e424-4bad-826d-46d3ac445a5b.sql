-- Drop and recreate update_settings function with proper WHERE clause
CREATE OR REPLACE FUNCTION public.update_settings(
  p_delivery_rate_per_km double precision DEFAULT NULL,
  p_is_open boolean DEFAULT NULL,
  p_max_delivery_distance double precision DEFAULT NULL,
  p_min_delivery_fee double precision DEFAULT NULL,
  p_opening_hours jsonb DEFAULT NULL,
  p_pix_key text DEFAULT NULL,
  p_store_address text DEFAULT NULL,
  p_store_lat double precision DEFAULT NULL,
  p_store_lng double precision DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  -- Get the first settings record ID (there should only be one)
  SELECT id INTO v_settings_id FROM settings LIMIT 1;
  
  -- If no settings record exists, create one
  IF v_settings_id IS NULL THEN
    INSERT INTO settings (id) VALUES (gen_random_uuid()) RETURNING id INTO v_settings_id;
  END IF;
  
  -- Update the settings record with the provided values
  UPDATE settings SET
    delivery_rate_per_km = COALESCE(p_delivery_rate_per_km, delivery_rate_per_km),
    is_open = COALESCE(p_is_open, is_open),
    max_delivery_distance = COALESCE(p_max_delivery_distance, max_delivery_distance),
    min_delivery_fee = COALESCE(p_min_delivery_fee, min_delivery_fee),
    opening_hours = COALESCE(p_opening_hours, opening_hours),
    pix_key = COALESCE(p_pix_key, pix_key),
    store_address = COALESCE(p_store_address, store_address),
    store_lat = COALESCE(p_store_lat, store_lat),
    store_lng = COALESCE(p_store_lng, store_lng)
  WHERE id = v_settings_id;
END;
$$;