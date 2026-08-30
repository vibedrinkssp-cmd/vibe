-- Fix ambiguous RPC call: remove overloaded update_settings and keep a single canonical signature

-- Drop the two known overloads (orders/types based on PostgREST error message)
DROP FUNCTION IF EXISTS public.update_settings(
  double precision,
  boolean,
  double precision,
  double precision,
  jsonb,
  text,
  text,
  double precision,
  double precision
);

DROP FUNCTION IF EXISTS public.update_settings(
  boolean,
  numeric,
  numeric,
  numeric,
  text,
  text,
  numeric,
  numeric,
  jsonb
);

-- Recreate ONE update_settings function (no overload) with stable types:
-- - monetary fields as numeric
-- - coordinates as double precision
CREATE OR REPLACE FUNCTION public.update_settings(
  p_is_open boolean DEFAULT NULL,
  p_delivery_rate_per_km numeric DEFAULT NULL,
  p_min_delivery_fee numeric DEFAULT NULL,
  p_max_delivery_distance numeric DEFAULT NULL,
  p_pix_key text DEFAULT NULL,
  p_store_address text DEFAULT NULL,
  p_store_lat double precision DEFAULT NULL,
  p_store_lng double precision DEFAULT NULL,
  p_opening_hours jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
BEGIN
  -- There should be only one settings record
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
    opening_hours = COALESCE(p_opening_hours, opening_hours)
  WHERE id = v_settings_id;
END;
$$;