
CREATE OR REPLACE FUNCTION public.issue_session_token(p_user_id uuid, p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_session_token text;
  v_ttl interval;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Usuário inválido'; END IF;
  IF p_role IS NULL OR btrim(p_role) = '' THEN RAISE EXCEPTION 'Perfil inválido'; END IF;

  -- 4h para painéis críticos, 12h para operacionais
  IF p_role IN ('admin', 'manager', 'financeiro') THEN
    v_ttl := interval '4 hours';
  ELSE
    v_ttl := interval '12 hours';
  END IF;

  v_session_token := gen_random_uuid()::text;

  INSERT INTO public.sessions (user_id, token, role, expires_at, is_active)
  VALUES (p_user_id, v_session_token, p_role, now() + v_ttl, true);

  PERFORM public.cleanup_expired_sessions();
  RETURN v_session_token;
END;
$function$;
