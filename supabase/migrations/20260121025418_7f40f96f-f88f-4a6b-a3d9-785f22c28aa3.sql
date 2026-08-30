-- Add expiration date to coupons
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS assign_to_all BOOLEAN DEFAULT false;

-- Drop and recreate functions without auth.uid() check for admin operations
-- These functions use the admin user_id passed as parameter

-- Function to create a custom coupon for a specific user (admin version)
CREATE OR REPLACE FUNCTION create_custom_coupon_admin(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_code TEXT,
  p_description TEXT,
  p_coupon_type TEXT,
  p_discount_percent NUMERIC,
  p_max_discount_value NUMERIC DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_min_quantity INTEGER DEFAULT 1,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
  v_user_coupon_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Validate caller is admin by checking user_roles
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can create coupons';
  END IF;

  -- Create the coupon
  INSERT INTO coupons (
    code,
    description,
    coupon_type,
    discount_percent,
    max_discount_value,
    product_id,
    category_id,
    min_quantity,
    is_template,
    is_active,
    created_by,
    expires_at
  ) VALUES (
    p_code,
    p_description,
    p_coupon_type,
    p_discount_percent,
    p_max_discount_value,
    p_product_id,
    p_category_id,
    p_min_quantity,
    false,
    true,
    p_admin_user_id,
    p_expires_at
  ) RETURNING id INTO v_coupon_id;

  -- Assign to user
  INSERT INTO user_coupons (
    user_id,
    coupon_id,
    assigned_by
  ) VALUES (
    p_target_user_id,
    v_coupon_id,
    p_admin_user_id
  ) RETURNING id INTO v_user_coupon_id;

  RETURN v_coupon_id;
END;
$$;

-- Function to assign coupon with custom max value (admin version)
CREATE OR REPLACE FUNCTION assign_coupon_with_max_value_admin(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_coupon_id UUID,
  p_max_discount_value NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_coupon_id UUID;
  v_coupon_record RECORD;
  v_user_coupon_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Validate caller is admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can assign coupons with custom values';
  END IF;

  -- Get original coupon
  SELECT * INTO v_coupon_record FROM coupons WHERE id = p_coupon_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  -- Create a copy with the new max value
  INSERT INTO coupons (
    code,
    description,
    coupon_type,
    discount_percent,
    max_discount_value,
    product_id,
    category_id,
    min_quantity,
    is_template,
    is_active,
    created_by,
    expires_at
  ) VALUES (
    v_coupon_record.code || '_' || SUBSTRING(gen_random_uuid()::text, 1, 6),
    v_coupon_record.description,
    v_coupon_record.coupon_type,
    v_coupon_record.discount_percent,
    p_max_discount_value,
    v_coupon_record.product_id,
    v_coupon_record.category_id,
    v_coupon_record.min_quantity,
    false,
    true,
    p_admin_user_id,
    v_coupon_record.expires_at
  ) RETURNING id INTO v_new_coupon_id;

  -- Assign to user
  INSERT INTO user_coupons (
    user_id,
    coupon_id,
    assigned_by
  ) VALUES (
    p_target_user_id,
    v_new_coupon_id,
    p_admin_user_id
  ) RETURNING id INTO v_user_coupon_id;

  RETURN v_new_coupon_id;
END;
$$;

-- Function to create/update a coupon template (admin version)
CREATE OR REPLACE FUNCTION upsert_coupon_template_admin(
  p_admin_user_id UUID,
  p_id UUID,
  p_code TEXT,
  p_description TEXT,
  p_coupon_type TEXT,
  p_discount_percent NUMERIC,
  p_max_discount_value NUMERIC DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_min_quantity INTEGER DEFAULT 1,
  p_is_active BOOLEAN DEFAULT true,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_assign_to_all BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
  v_is_admin BOOLEAN;
  v_user RECORD;
BEGIN
  -- Validate caller is admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can manage coupon templates';
  END IF;

  IF p_id IS NULL THEN
    -- Create new coupon
    INSERT INTO coupons (
      code,
      description,
      coupon_type,
      discount_percent,
      max_discount_value,
      product_id,
      category_id,
      min_quantity,
      is_template,
      is_active,
      created_by,
      expires_at,
      assign_to_all
    ) VALUES (
      p_code,
      p_description,
      p_coupon_type,
      p_discount_percent,
      p_max_discount_value,
      p_product_id,
      p_category_id,
      p_min_quantity,
      true,
      p_is_active,
      p_admin_user_id,
      p_expires_at,
      p_assign_to_all
    ) RETURNING id INTO v_coupon_id;
    
    -- If assign_to_all is true, assign to all existing customers
    IF p_assign_to_all THEN
      FOR v_user IN 
        SELECT u.id FROM users u
        INNER JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.role = 'customer' AND u.is_blocked = false
      LOOP
        INSERT INTO user_coupons (user_id, coupon_id, assigned_by)
        VALUES (v_user.id, v_coupon_id, p_admin_user_id)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END IF;
  ELSE
    -- Update existing coupon
    UPDATE coupons SET
      code = p_code,
      description = p_description,
      coupon_type = p_coupon_type,
      discount_percent = p_discount_percent,
      max_discount_value = p_max_discount_value,
      product_id = p_product_id,
      category_id = p_category_id,
      min_quantity = p_min_quantity,
      is_active = p_is_active,
      expires_at = p_expires_at,
      assign_to_all = p_assign_to_all
    WHERE id = p_id;
    
    v_coupon_id := p_id;
  END IF;

  RETURN v_coupon_id;
END;
$$;

-- Function to delete a coupon template (admin version)
CREATE OR REPLACE FUNCTION delete_coupon_template_admin(p_admin_user_id UUID, p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- Validate caller is admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can delete coupon templates';
  END IF;

  -- Delete associated user_coupons first
  DELETE FROM user_coupons WHERE coupon_id = p_coupon_id;
  
  -- Delete the coupon
  DELETE FROM coupons WHERE id = p_coupon_id;

  RETURN TRUE;
END;
$$;

-- Function to get all coupons for admin (including usage stats)
CREATE OR REPLACE FUNCTION get_all_coupons_admin(p_admin_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  code TEXT,
  description TEXT,
  coupon_type TEXT,
  discount_percent NUMERIC,
  max_discount_value NUMERIC,
  product_id UUID,
  category_id UUID,
  min_quantity INTEGER,
  is_template BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  created_by UUID,
  expires_at TIMESTAMPTZ,
  assign_to_all BOOLEAN,
  times_assigned INTEGER,
  times_used INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- If admin_user_id is provided, validate. Otherwise allow for backwards compatibility
  IF p_admin_user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Only admins can view all coupons';
    END IF;
  END IF;

  RETURN QUERY
  SELECT 
    c.id,
    c.code,
    c.description,
    c.coupon_type,
    c.discount_percent,
    c.max_discount_value,
    c.product_id,
    c.category_id,
    c.min_quantity,
    c.is_template,
    c.is_active,
    c.created_at,
    c.created_by,
    c.expires_at,
    COALESCE(c.assign_to_all, false) as assign_to_all,
    COALESCE((SELECT COUNT(*)::INTEGER FROM user_coupons uc WHERE uc.coupon_id = c.id), 0) as times_assigned,
    COALESCE((SELECT COUNT(*)::INTEGER FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.is_used = true), 0) as times_used
  FROM coupons c
  ORDER BY c.is_template DESC, c.created_at DESC;
END;
$$;

-- Function to assign coupon to user (admin version)
CREATE OR REPLACE FUNCTION assign_coupon_to_user_admin(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_coupon_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_coupon_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Validate caller is admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can assign coupons';
  END IF;

  -- Assign to user
  INSERT INTO user_coupons (
    user_id,
    coupon_id,
    assigned_by
  ) VALUES (
    p_target_user_id,
    p_coupon_id,
    p_admin_user_id
  ) RETURNING id INTO v_user_coupon_id;

  RETURN v_user_coupon_id;
END;
$$;