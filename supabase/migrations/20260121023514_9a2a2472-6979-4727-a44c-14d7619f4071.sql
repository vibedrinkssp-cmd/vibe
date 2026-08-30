-- Function to create a custom coupon for a specific user
CREATE OR REPLACE FUNCTION create_custom_coupon(
  p_user_id UUID,
  p_code TEXT,
  p_description TEXT,
  p_coupon_type TEXT,
  p_discount_percent NUMERIC,
  p_max_discount_value NUMERIC DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_min_quantity INTEGER DEFAULT 1
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
  v_user_coupon_id UUID;
BEGIN
  -- Validate caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
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
    created_by
  ) VALUES (
    p_code,
    p_description,
    p_coupon_type,
    p_discount_percent,
    p_max_discount_value,
    p_product_id,
    p_category_id,
    p_min_quantity,
    false, -- not a template
    true,
    auth.uid()
  ) RETURNING id INTO v_coupon_id;

  -- Assign to user
  INSERT INTO user_coupons (
    user_id,
    coupon_id,
    assigned_by
  ) VALUES (
    p_user_id,
    v_coupon_id,
    auth.uid()
  ) RETURNING id INTO v_user_coupon_id;

  RETURN v_coupon_id;
END;
$$;

-- Function to assign coupon with custom max value
CREATE OR REPLACE FUNCTION assign_coupon_with_max_value(
  p_user_id UUID,
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
BEGIN
  -- Validate caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
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
    created_by
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
    auth.uid()
  ) RETURNING id INTO v_new_coupon_id;

  -- Assign to user
  INSERT INTO user_coupons (
    user_id,
    coupon_id,
    assigned_by
  ) VALUES (
    p_user_id,
    v_new_coupon_id,
    auth.uid()
  ) RETURNING id INTO v_user_coupon_id;

  RETURN v_new_coupon_id;
END;
$$;

-- Function to create/update a coupon template (admin)
CREATE OR REPLACE FUNCTION upsert_coupon_template(
  p_id UUID,
  p_code TEXT,
  p_description TEXT,
  p_coupon_type TEXT,
  p_discount_percent NUMERIC,
  p_max_discount_value NUMERIC DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_min_quantity INTEGER DEFAULT 1,
  p_is_active BOOLEAN DEFAULT true
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id UUID;
BEGIN
  -- Validate caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
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
      created_by
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
      auth.uid()
    ) RETURNING id INTO v_coupon_id;
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
      is_active = p_is_active
    WHERE id = p_id;
    
    v_coupon_id := p_id;
  END IF;

  RETURN v_coupon_id;
END;
$$;

-- Function to delete a coupon template (admin)
CREATE OR REPLACE FUNCTION delete_coupon_template(p_coupon_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
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
CREATE OR REPLACE FUNCTION get_all_coupons_admin()
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
  times_assigned INTEGER,
  times_used INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate caller is admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can view all coupons';
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
    COALESCE((SELECT COUNT(*)::INTEGER FROM user_coupons uc WHERE uc.coupon_id = c.id), 0) as times_assigned,
    COALESCE((SELECT COUNT(*)::INTEGER FROM user_coupons uc WHERE uc.coupon_id = c.id AND uc.is_used = true), 0) as times_used
  FROM coupons c
  ORDER BY c.is_template DESC, c.created_at DESC;
END;
$$;