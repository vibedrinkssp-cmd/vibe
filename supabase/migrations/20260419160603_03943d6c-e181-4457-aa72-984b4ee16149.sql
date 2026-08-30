CREATE OR REPLACE FUNCTION public.renew_bottle(p_bottle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bottle RECORD;
  v_existing_active_id uuid;
BEGIN
  SELECT * INTO v_bottle FROM open_bottles WHERE id = p_bottle_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;
  
  IF NOT v_bottle.is_empty THEN
    RAISE EXCEPTION 'Garrafa ainda não está vazia';
  END IF;
  
  -- Check if there is ALREADY another active (non-empty) bottle for this product
  SELECT id INTO v_existing_active_id
  FROM open_bottles
  WHERE product_id = v_bottle.product_id
    AND is_empty = false
    AND id <> p_bottle_id
  LIMIT 1;
  
  IF v_existing_active_id IS NOT NULL THEN
    -- Active bottle already exists. Just delete the empty one (no need to renew)
    -- and still deduct 1 unit from stock since user intent is "open a new bottle".
    -- Actually: do NOT deduct. The active bottle is already open. Just clean up.
    DELETE FROM open_bottles WHERE id = p_bottle_id;
    RETURN v_existing_active_id;
  END IF;
  
  -- No conflict: refill the same bottle
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
$function$;