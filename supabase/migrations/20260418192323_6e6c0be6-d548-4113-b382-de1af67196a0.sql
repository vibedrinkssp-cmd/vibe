-- 1) Adicionar settings ao realtime e garantir REPLICA IDENTITY FULL para payloads completos
ALTER TABLE public.settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
  END IF;
END $$;

-- 2) RPC dedicada e atômica para alterar APENAS o status aberto/fechado
CREATE OR REPLACE FUNCTION public.set_store_open(p_is_open boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_settings_id uuid;
  v_new_value boolean;
BEGIN
  IF p_is_open IS NULL THEN
    RAISE EXCEPTION 'p_is_open não pode ser nulo';
  END IF;

  SELECT id INTO v_settings_id FROM public.settings LIMIT 1;

  IF v_settings_id IS NULL THEN
    INSERT INTO public.settings (id, is_open)
    VALUES (gen_random_uuid(), p_is_open)
    RETURNING is_open INTO v_new_value;
  ELSE
    UPDATE public.settings
       SET is_open = p_is_open
     WHERE id = v_settings_id
     RETURNING is_open INTO v_new_value;
  END IF;

  RETURN v_new_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_store_open(boolean) TO anon, authenticated;