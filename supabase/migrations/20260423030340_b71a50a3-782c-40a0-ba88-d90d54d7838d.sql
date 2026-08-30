-- Liberar acesso às RPCs de clientes/endereços para PDV (e endereços também para Kitchen/Motoboy)
-- Permitindo que o painel "Pedidos" acessado pelo PDV mostre nome e endereço do cliente

CREATE OR REPLACE FUNCTION public.get_all_users_with_role()
RETURNS TABLE(id uuid, name text, whatsapp text, cpf text, password text, is_blocked boolean, requires_password_change boolean, created_at timestamp with time zone, role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pdv'::app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer admin ou pdv';
  END IF;

  RETURN QUERY
    SELECT u.id, u.name, u.whatsapp, u.cpf, u.password, u.is_blocked,
           u.requires_password_change, u.created_at,
           COALESCE(ur.role::text, 'customer') as role
    FROM public.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    ORDER BY u.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_addresses()
RETURNS SETOF public.addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'pdv'::app_role)
    OR public.has_role(auth.uid(), 'kitchen'::app_role)
    OR public.has_role(auth.uid(), 'motoboy'::app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer staff';
  END IF;

  RETURN QUERY SELECT * FROM public.addresses;
END;
$function$;