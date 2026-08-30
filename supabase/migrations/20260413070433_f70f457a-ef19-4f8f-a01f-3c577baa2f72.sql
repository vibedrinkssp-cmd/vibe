DROP FUNCTION IF EXISTS public.get_all_users_with_role();

CREATE FUNCTION public.get_all_users_with_role()
RETURNS TABLE(id uuid, name text, whatsapp text, cpf text, password text, is_blocked boolean, requires_password_change boolean, created_at timestamptz, role text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.name, u.whatsapp, u.cpf, u.password, u.is_blocked, u.requires_password_change, u.created_at,
    COALESCE(ur.role::text, 'customer') as role
  FROM public.users u LEFT JOIN public.user_roles ur ON ur.user_id = u.id ORDER BY u.created_at DESC;
END;
$$;