
-- Drop functions with incompatible return types
DROP FUNCTION IF EXISTS public.assign_coupon_with_max_value(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS public.create_custom_coupon(text, text, numeric, text, uuid, uuid, uuid, integer, numeric);
DROP FUNCTION IF EXISTS public.delete_coupon_template(uuid);
DROP FUNCTION IF EXISTS public.upsert_coupon_template(uuid, text, text, numeric, text, uuid, uuid, integer, numeric, boolean, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.upsert_coupon_template(uuid, text, text, numeric, text, uuid, uuid, integer, numeric, boolean, boolean);

-- Recreate with correct signatures (keeping original return types)
CREATE FUNCTION public.assign_coupon_with_max_value(p_coupon_id uuid, p_user_id uuid, p_max_discount_value numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.user_coupons (coupon_id, user_id) VALUES (p_coupon_id, p_user_id) RETURNING id INTO v_id;
  UPDATE public.coupons SET max_discount_value = p_max_discount_value WHERE id = p_coupon_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.create_custom_coupon(
  p_code text, p_description text, p_discount_percent numeric,
  p_coupon_type text, p_user_id uuid,
  p_product_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL,
  p_min_quantity integer DEFAULT 1, p_max_discount_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_coupon_id uuid;
BEGIN
  INSERT INTO public.coupons (code, description, discount_percent, coupon_type, product_id, category_id, min_quantity, max_discount_value, created_by)
  VALUES (p_code, p_description, p_discount_percent, p_coupon_type, p_product_id, p_category_id, p_min_quantity, p_max_discount_value, p_user_id)
  RETURNING id INTO v_coupon_id;
  RETURN v_coupon_id;
END;
$$;

CREATE FUNCTION public.delete_coupon_template(p_coupon_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_coupons WHERE coupon_id = p_coupon_id;
  DELETE FROM public.coupons WHERE id = p_coupon_id;
  RETURN true;
END;
$$;

CREATE FUNCTION public.upsert_coupon_template(
  p_id uuid DEFAULT NULL, p_code text DEFAULT NULL, p_description text DEFAULT NULL,
  p_discount_percent numeric DEFAULT 0, p_coupon_type text DEFAULT 'percent',
  p_product_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL,
  p_min_quantity integer DEFAULT 1, p_max_discount_value numeric DEFAULT NULL,
  p_assign_to_all boolean DEFAULT false, p_is_active boolean DEFAULT true,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE public.coupons SET
      code = COALESCE(p_code, code), description = COALESCE(p_description, description),
      discount_percent = p_discount_percent, coupon_type = p_coupon_type,
      product_id = p_product_id, category_id = p_category_id,
      min_quantity = p_min_quantity, max_discount_value = p_max_discount_value,
      assign_to_all = p_assign_to_all, is_active = p_is_active, expires_at = p_expires_at
    WHERE id = p_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.coupons (code, description, discount_percent, coupon_type, product_id, category_id, min_quantity, max_discount_value, assign_to_all, is_active, is_template, expires_at)
    VALUES (p_code, p_description, p_discount_percent, p_coupon_type, p_product_id, p_category_id, p_min_quantity, p_max_discount_value, p_assign_to_all, p_is_active, true, p_expires_at)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Grant anon access
GRANT EXECUTE ON FUNCTION public.assign_coupon_with_max_value(uuid, uuid, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.create_custom_coupon(text, text, numeric, text, uuid, uuid, uuid, integer, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.delete_coupon_template(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_coupon_template(uuid, text, text, numeric, text, uuid, uuid, integer, numeric, boolean, boolean, timestamptz) TO anon;

-- Clean orders for production
DELETE FROM public.order_items;
DELETE FROM public.orders;
