CREATE OR REPLACE FUNCTION public.issue_session_token(p_user_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_token text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário inválido';
  END IF;

  IF p_role IS NULL OR btrim(p_role) = '' THEN
    RAISE EXCEPTION 'Perfil inválido';
  END IF;

  UPDATE public.sessions
  SET is_active = false
  WHERE user_id = p_user_id
    AND role = p_role
    AND is_active = true;

  v_session_token := gen_random_uuid()::text;

  INSERT INTO public.sessions (
    user_id,
    token,
    role,
    expires_at,
    is_active
  ) VALUES (
    p_user_id,
    v_session_token,
    p_role,
    now() + interval '24 hours',
    true
  );

  PERFORM public.cleanup_expired_sessions();

  RETURN v_session_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.issue_session_token(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.staff_login_rpc(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_valid BOOLEAN;
  v_session_token TEXT;
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

  v_session_token := public.issue_session_token(v_user.id, v_role);

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'whatsapp', v_user.whatsapp,
      'role', v_role,
      'createdAt', v_user.created_at,
      'requiresPasswordChange', COALESCE(v_user.requires_password_change, false)
    ),
    'sessionToken', v_session_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.customer_login_rpc(p_whatsapp text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_address RECORD;
  v_valid BOOLEAN;
  v_session_token TEXT;
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

  v_session_token := public.issue_session_token(v_user.id, v_role);
  
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
    ) ELSE NULL END,
    'sessionToken', v_session_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.motoboy_login_rpc(p_whatsapp text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user RECORD;
  v_role TEXT;
  v_valid BOOLEAN;
  v_session_token TEXT;
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

  v_session_token := public.issue_session_token(v_user.id, v_role);

  RETURN jsonb_build_object(
    'success', true,
    'user', jsonb_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'whatsapp', v_user.whatsapp,
      'role', 'motoboy',
      'createdAt', v_user.created_at
    ),
    'sessionToken', v_session_token
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_staff_login(p_role text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    found_user RECORD;
    v_session_token TEXT;
BEGIN
    FOR found_user IN 
        SELECT u.* FROM users u
        INNER JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = p_role::app_role
        AND u.is_blocked = FALSE
    LOOP
        IF verify_user_password(found_user.id, p_password) THEN
            v_session_token := public.issue_session_token(found_user.id, p_role);
            RETURN json_build_object(
                'success', true,
                'user', json_build_object(
                    'id', found_user.id,
                    'name', found_user.name,
                    'whatsapp', found_user.whatsapp,
                    'role', p_role
                ),
                'sessionToken', v_session_token
            );
        END IF;
    END LOOP;
    
    RETURN json_build_object('success', false, 'error', 'Senha incorreta');
END;
$function$;