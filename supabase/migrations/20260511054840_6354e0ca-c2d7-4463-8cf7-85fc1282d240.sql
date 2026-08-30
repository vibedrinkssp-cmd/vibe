-- Add serper_api_key column to settings table
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS serper_api_key TEXT;

-- Update update_settings RPC to accept serper_api_key
CREATE OR REPLACE FUNCTION public.update_settings(
  p_is_open boolean DEFAULT NULL,
  p_delivery_rate_per_km numeric DEFAULT NULL,
  p_min_delivery_fee numeric DEFAULT NULL,
  p_max_delivery_distance numeric DEFAULT NULL,
  p_pix_key text DEFAULT NULL,
  p_store_address text DEFAULT NULL,
  p_store_lat double precision DEFAULT NULL,
  p_store_lng double precision DEFAULT NULL,
  p_opening_hours jsonb DEFAULT NULL,
  p_serper_api_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  SELECT id INTO v_settings_id FROM public.settings LIMIT 1;

  IF v_settings_id IS NULL THEN
    INSERT INTO public.settings (id) VALUES (gen_random_uuid())
    RETURNING id INTO v_settings_id;
  END IF;

  UPDATE public.settings
  SET
    is_open = COALESCE(p_is_open, is_open),
    delivery_rate_per_km = COALESCE(p_delivery_rate_per_km, delivery_rate_per_km),
    min_delivery_fee = COALESCE(p_min_delivery_fee, min_delivery_fee),
    max_delivery_distance = COALESCE(p_max_delivery_distance, max_delivery_distance),
    pix_key = COALESCE(p_pix_key, pix_key),
    store_address = COALESCE(p_store_address, store_address),
    store_lat = COALESCE(p_store_lat, store_lat),
    store_lng = COALESCE(p_store_lng, store_lng),
    opening_hours = COALESCE(p_opening_hours, opening_hours),
    serper_api_key = COALESCE(p_serper_api_key, serper_api_key)
  WHERE id = v_settings_id;
END;
$$;
