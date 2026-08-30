CREATE OR REPLACE FUNCTION public.renew_bottle(p_bottle_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bottle RECORD;
  v_dup_id uuid;
BEGIN
  SELECT * INTO v_bottle FROM open_bottles WHERE id = p_bottle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;

  IF NOT v_bottle.is_empty THEN
    RAISE EXCEPTION 'Garrafa ainda não está vazia';
  END IF;

  -- If there is another ACTIVE bottle for the same product, delete the duplicate
  -- so the renewed one becomes the single active bottle (constraint compliance)
  FOR v_dup_id IN
    SELECT id FROM open_bottles
    WHERE product_id = v_bottle.product_id
      AND is_empty = false
      AND id <> p_bottle_id
  LOOP
    DELETE FROM open_bottles WHERE id = v_dup_id;
  END LOOP;

  -- Renew this bottle with ORIGINAL config (total_doses unchanged)
  UPDATE open_bottles
  SET remaining_doses = total_doses,
      is_empty = false,
      emptied_at = NULL,
      opened_at = now(),
      opened_by = COALESCE(opened_by, '') || ' | ♻️ Renovada KDE',
      notes = COALESCE(notes || ' | ', '') || '♻️ Renovada em ' || to_char(now(), 'DD/MM HH24:MI')
  WHERE id = p_bottle_id;

  -- Deduct 1 from product stock (a physical bottle is consumed)
  UPDATE products SET stock = GREATEST(0, COALESCE(stock,0) - 1) WHERE id = v_bottle.product_id;

  RETURN p_bottle_id;
END;
$function$;