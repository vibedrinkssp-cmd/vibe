
REVOKE EXECUTE ON FUNCTION public.verify_panel_password_v2(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_operation_pin_v2(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_panel_password_v2(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_operation_pin_v2(text, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_panel_password_v2(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_operation_pin_v2(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_panel_password_v2(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_operation_pin_v2(text, text, text, text) TO service_role;
