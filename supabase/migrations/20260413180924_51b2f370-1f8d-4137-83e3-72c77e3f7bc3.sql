
CREATE OR REPLACE FUNCTION public.renew_bottle(p_bottle_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old RECORD;
  v_new_id uuid;
BEGIN
  -- Get the old bottle data
  SELECT * INTO v_old FROM open_bottles WHERE id = p_bottle_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;
  
  IF NOT v_old.is_empty THEN
    RAISE EXCEPTION 'Garrafa ainda não está vazia';
  END IF;
  
  -- Create new bottle with same config
  INSERT INTO open_bottles (
    product_id, product_name, total_ml, ml_per_dose, 
    total_doses, remaining_doses, dose_price, 
    opened_by, notes
  ) VALUES (
    v_old.product_id, v_old.product_name, v_old.total_ml, v_old.ml_per_dose,
    v_old.total_doses, v_old.total_doses, v_old.dose_price,
    'KDE (Renovação)', '♻️ Renovada da garrafa ' || v_old.id::text
  )
  RETURNING id INTO v_new_id;
  
  -- Update old bottle notes
  UPDATE open_bottles 
  SET notes = COALESCE(notes || ' | ', '') || '♻️ Renovada → ' || v_new_id::text
  WHERE id = p_bottle_id;
  
  -- Deduct 1 from product stock
  UPDATE products SET stock = GREATEST(0, stock - 1) WHERE id = v_old.product_id;
  
  RETURN v_new_id;
END;
$$;
