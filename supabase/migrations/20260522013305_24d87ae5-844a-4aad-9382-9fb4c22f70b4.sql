CREATE OR REPLACE FUNCTION public.get_all_orders()
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pdv'::public.app_role)
    OR public.has_role(auth.uid(), 'kitchen'::public.app_role)
    OR public.has_role(auth.uid(), 'motoboy'::public.app_role)
    OR public.has_role(auth.uid(), 'log'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: requer equipe operacional';
  END IF;

  RETURN QUERY SELECT * FROM public.orders ORDER BY created_at DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_all_orders() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_orders_complete() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_all_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_orders_complete() TO authenticated;