
CREATE OR REPLACE FUNCTION public.renew_bottle(p_bottle_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bottle RECORD;
BEGIN
  SELECT * INTO v_bottle FROM open_bottles WHERE id = p_bottle_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;
  
  IF NOT v_bottle.is_empty THEN
    RAISE EXCEPTION 'Garrafa ainda não está vazia';
  END IF;
  
  -- Refill the same bottle
  UPDATE open_bottles
  SET remaining_doses = total_doses,
      is_empty = false,
      emptied_at = NULL,
      opened_at = now(),
      opened_by = COALESCE(opened_by, '') || ' | ♻️ Renovada KDE',
      notes = COALESCE(notes || ' | ', '') || '♻️ Renovada em ' || to_char(now(), 'DD/MM HH24:MI')
  WHERE id = p_bottle_id;
  
  -- Deduct 1 from product stock
  UPDATE products SET stock = GREATEST(0, stock - 1) WHERE id = v_bottle.product_id;
  
  RETURN p_bottle_id;
END;
$$;
