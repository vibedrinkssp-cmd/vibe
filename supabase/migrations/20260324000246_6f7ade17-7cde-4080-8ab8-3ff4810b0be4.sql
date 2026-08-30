
-- RPC to get addresses for a specific user (SECURITY DEFINER to bypass RLS)
CREATE OR REPLACE FUNCTION public.get_user_addresses(p_user_id uuid)
RETURNS SETOF public.addresses
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.addresses WHERE user_id = p_user_id ORDER BY is_default DESC, street ASC;
$$;

-- RPC to create address for a user
CREATE OR REPLACE FUNCTION public.create_user_address(
  p_user_id uuid,
  p_street text,
  p_number text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_complement text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_is_default boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- If setting as default, unset others first
  IF p_is_default THEN
    UPDATE public.addresses SET is_default = false WHERE user_id = p_user_id;
  END IF;
  
  INSERT INTO public.addresses (user_id, street, number, neighborhood, city, state, complement, zip_code, notes, latitude, longitude, is_default)
  VALUES (p_user_id, p_street, p_number, p_neighborhood, p_city, p_state, p_complement, p_zip_code, p_notes, p_latitude, p_longitude, p_is_default)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- RPC to update an address
CREATE OR REPLACE FUNCTION public.update_user_address(
  p_address_id uuid,
  p_user_id uuid,
  p_street text,
  p_number text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_complement text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.addresses
  SET street = p_street, number = p_number, neighborhood = p_neighborhood,
      city = p_city, state = p_state, complement = p_complement,
      zip_code = p_zip_code, notes = p_notes, latitude = p_latitude, longitude = p_longitude
  WHERE id = p_address_id AND user_id = p_user_id;
END;
$$;

-- RPC to delete an address
CREATE OR REPLACE FUNCTION public.delete_user_address(p_address_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.addresses WHERE id = p_address_id AND user_id = p_user_id;
END;
$$;

-- RPC to set default address
CREATE OR REPLACE FUNCTION public.set_default_address(p_address_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.addresses SET is_default = false WHERE user_id = p_user_id;
  UPDATE public.addresses SET is_default = true WHERE id = p_address_id AND user_id = p_user_id;
END;
$$;
