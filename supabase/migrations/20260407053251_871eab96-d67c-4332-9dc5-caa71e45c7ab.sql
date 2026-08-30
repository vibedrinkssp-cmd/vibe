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

  -- Keep existing valid sessions active so a new login does not break
  -- uploads or protected actions running in another device or tab.
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