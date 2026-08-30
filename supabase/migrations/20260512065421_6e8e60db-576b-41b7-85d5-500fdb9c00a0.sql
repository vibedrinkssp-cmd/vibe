-- Permite invocar a RPC de troca de senha a partir do painel Manager (sessão authenticated).
-- A função change_panel_password_v2 já é SECURITY DEFINER e exige a senha atual antes de gravar.
GRANT EXECUTE ON FUNCTION public.change_panel_password_v2(text, text, text, text) TO authenticated;