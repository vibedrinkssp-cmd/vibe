
-- RPC para login de motoboy via whatsapp (fallback quando edge function falha)
CREATE OR REPLACE FUNCTION public.motoboy_login_rpc(
  p_whatsapp TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_valid BOOLEAN;
BEGIN
  SELECT * INTO v_user FROM users WHERE whatsapp = p_whatsapp;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Motoboy não encontrado');
  END IF;

  SELECT role INTO v_role FROM user_roles WHERE user_id = v_user.id;
  IF v_role IS DISTINCT FROM 'motoboy' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não é motoboy');
  END IF;

  IF v_user.is_blocked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário bloqueado');
  END IF;

  SELECT verify_user_password(v_user.id, p_password) INTO v_valid;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha incorreta');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'whatsapp', v_user.whatsapp,
      'role', 'motoboy',
      'createdAt', v_user.created_at
    )
  );
END;
$$;

-- RPC para login de staff (admin/pdv/kitchen) via nome (fallback quando edge function falha)
CREATE OR REPLACE FUNCTION public.staff_login_rpc(
  p_username TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_valid BOOLEAN;
BEGIN
  SELECT * INTO v_user FROM users WHERE lower(name) = lower(p_username);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não encontrado');
  END IF;

  IF v_user.is_blocked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário bloqueado');
  END IF;

  SELECT role INTO v_role FROM user_roles WHERE user_id = v_user.id;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'kitchen', 'pdv') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário sem permissão');
  END IF;

  SELECT verify_user_password(v_user.id, p_password) INTO v_valid;
  IF NOT v_valid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha incorreta');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'whatsapp', v_user.whatsapp,
      'role', v_role,
      'createdAt', v_user.created_at,
      'requiresPasswordChange', COALESCE(v_user.requires_password_change, false)
    )
  );
END;
$$;
