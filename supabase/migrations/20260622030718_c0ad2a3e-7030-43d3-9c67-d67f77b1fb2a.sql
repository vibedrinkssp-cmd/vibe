REVOKE EXECUTE ON FUNCTION public.get_kitchen_orders_complete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_kitchen_orders_complete() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_complete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_kitchen_orders_complete() TO service_role;