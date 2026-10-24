-- Liga/desliga as entregas (PDV e admin). Desligada = cliente só consegue "Retirar na loja".
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS delivery_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_delivery_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT delivery_enabled FROM public.settings LIMIT 1), true);
$$;

CREATE OR REPLACE FUNCTION public.set_delivery_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings_id uuid;
  v_new_value boolean;
BEGIN
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'p_enabled não pode ser nulo';
  END IF;

  SELECT id INTO v_settings_id FROM public.settings LIMIT 1;

  IF v_settings_id IS NULL THEN
    INSERT INTO public.settings (id, delivery_enabled)
    VALUES (gen_random_uuid(), p_enabled)
    RETURNING delivery_enabled INTO v_new_value;
  ELSE
    UPDATE public.settings
       SET delivery_enabled = p_enabled
     WHERE id = v_settings_id
     RETURNING delivery_enabled INTO v_new_value;
  END IF;

  RETURN v_new_value;
END;
$$;

-- Mesmo modelo do set_store_open: o PDV/admin usam login próprio (sem auth.uid()).
GRANT EXECUTE ON FUNCTION public.get_delivery_enabled() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_delivery_enabled(boolean) TO anon, authenticated;
