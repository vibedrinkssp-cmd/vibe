
CREATE OR REPLACE FUNCTION public.toggle_allowed_bottle(
  p_session_token uuid,
  p_config_id uuid,
  p_product_id uuid,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_result jsonb;
BEGIN
  -- Validate admin session
  SELECT role, is_active, expires_at INTO v_session
  FROM sessions
  WHERE token = p_session_token::text
    AND is_active = true
    AND expires_at > now();

  IF NOT FOUND OR v_session.role != 'admin' THEN
    RETURN jsonb_build_object('error', 'Sessão administrativa inválida', 'success', false);
  END IF;

  IF p_enabled THEN
    INSERT INTO special_drink_allowed_products (config_id, product_id)
    VALUES (p_config_id, p_product_id)
    ON CONFLICT (config_id, product_id) DO NOTHING;
  ELSE
    DELETE FROM special_drink_allowed_products
    WHERE config_id = p_config_id AND product_id = p_product_id;
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'enabled', p_enabled,
    'allowedProductIds', COALESCE(
      (SELECT jsonb_agg(product_id ORDER BY created_at)
       FROM special_drink_allowed_products
       WHERE config_id = p_config_id),
      '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
