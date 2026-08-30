DROP FUNCTION IF EXISTS public.delete_open_bottle(uuid);

CREATE OR REPLACE FUNCTION public.delete_open_bottle(p_bottle_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bottle public.open_bottles%ROWTYPE;
BEGIN
  SELECT * INTO v_bottle FROM public.open_bottles WHERE id = p_bottle_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.cash_register_audit (action, responsible, notes)
  VALUES (
    'bottle_deleted',
    'Kitchen',
    format('Garrafa excluída: %s (restavam: %s/%s doses, vazia=%s)',
      v_bottle.product_name,
      v_bottle.remaining_doses,
      v_bottle.total_doses,
      v_bottle.is_empty)
  );

  DELETE FROM public.open_bottles WHERE id = p_bottle_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_open_bottle(uuid) TO anon, authenticated, service_role;