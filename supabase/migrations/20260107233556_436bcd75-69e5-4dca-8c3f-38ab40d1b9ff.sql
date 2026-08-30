-- Create RPC functions for remaining admin operations

-- Function to toggle user blocked status
CREATE OR REPLACE FUNCTION public.toggle_user_blocked(
  p_user_id UUID,
  p_is_blocked BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users SET is_blocked = p_is_blocked WHERE id = p_user_id;
END;
$$;

-- Function to delete user
CREATE OR REPLACE FUNCTION public.delete_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete user coupons first
  DELETE FROM user_coupons WHERE user_id = p_user_id;
  -- Delete user roles
  DELETE FROM user_roles WHERE user_id = p_user_id;
  -- Delete user addresses
  DELETE FROM addresses WHERE user_id = p_user_id;
  -- Delete user
  DELETE FROM users WHERE id = p_user_id;
END;
$$;

-- Function to delete user coupon
CREATE OR REPLACE FUNCTION public.delete_user_coupon(p_user_coupon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_coupons WHERE id = p_user_coupon_id;
END;
$$;

-- Function to delete sangria
CREATE OR REPLACE FUNCTION public.delete_sangria(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete sangria items first
  DELETE FROM sangria_items WHERE sangria_id = p_id;
  -- Delete sangria
  DELETE FROM sangrias WHERE id = p_id;
END;
$$;

-- Function to delete open bottle
CREATE OR REPLACE FUNCTION public.delete_open_bottle(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM open_bottles WHERE id = p_id;
END;
$$;

-- Function to create sangria
CREATE OR REPLACE FUNCTION public.create_sangria(
  p_amount NUMERIC,
  p_type TEXT DEFAULT 'outros',
  p_description TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_responsible TEXT DEFAULT 'Sistema'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO sangrias (amount, type, description, reason, responsible)
  VALUES (p_amount, p_type, p_description, p_reason, p_responsible)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;