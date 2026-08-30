
CREATE OR REPLACE FUNCTION public.customer_login_rpc(p_whatsapp TEXT, p_password TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_address RECORD;
  v_valid BOOLEAN;
BEGIN
  SELECT * INTO v_user FROM users WHERE whatsapp = p_whatsapp;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario nao encontrado');
  END IF;
  
  SELECT role INTO v_role FROM user_roles WHERE user_id = v_user.id;
  IF v_role IS DISTINCT FROM 'customer' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Use o login de funcionario');
  END IF;
  
  IF v_user.is_blocked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario bloqueado');
  END IF;
  
  SELECT verify_user_password(v_user.id, p_password) INTO v_valid;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha incorreta');
  END IF;
  
  SELECT * INTO v_address FROM addresses 
  WHERE user_id = v_user.id AND is_default = true LIMIT 1;
  
  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'whatsapp', v_user.whatsapp,
      'role', 'customer',
      'createdAt', v_user.created_at,
      'requiresPasswordChange', COALESCE(v_user.requires_password_change, false)
    ),
    'address', CASE WHEN v_address.id IS NOT NULL THEN jsonb_build_object(
      'id', v_address.id,
      'userId', v_address.user_id,
      'street', v_address.street,
      'number', v_address.number,
      'complement', v_address.complement,
      'neighborhood', v_address.neighborhood,
      'city', v_address.city,
      'state', v_address.state,
      'zipCode', COALESCE(v_address.zip_code, ''),
      'notes', v_address.notes,
      'isDefault', v_address.is_default,
      'latitude', v_address.latitude,
      'longitude', v_address.longitude
    ) ELSE NULL END
  );
END;
$$;
