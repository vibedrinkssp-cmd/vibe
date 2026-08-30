-- Usuário de teste para acesso aos painéis internos (admin/pdv/cozinha/log)
-- durante o setup do projeto Supabase novo. As senhas dos painéis já vêm
-- seedadas em panel_credentials (migration 20260511232525): admin=00827045,
-- pdv/kde/log=93939393. Este usuário só precisa existir com os roles certos
-- para o staff-login encontrar alguém a quem atribuir a sessão.
DO $$
DECLARE
  v_user_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO public.users (id, name, whatsapp, is_blocked)
  VALUES (v_user_id, 'Usuário Teste', '00000000000', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  SELECT v_user_id, r FROM unnest(ARRAY['admin','pdv','kitchen','log']::app_role[]) AS r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id AND role = r
  );
END $$;
