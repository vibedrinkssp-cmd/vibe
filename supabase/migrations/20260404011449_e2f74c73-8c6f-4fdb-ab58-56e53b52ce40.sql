
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_user_id uuid, 
  p_address_id uuid, 
  p_subtotal numeric DEFAULT 0, 
  p_delivery_fee numeric DEFAULT 0, 
  p_discount numeric DEFAULT 0, 
  p_total numeric DEFAULT 0, 
  p_payment_method payment_method DEFAULT 'pix'::payment_method, 
  p_change_for numeric DEFAULT NULL::numeric, 
  p_notes text DEFAULT NULL::text,
  p_delivery_distance numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_order_id uuid;
  v_user_blocked boolean;
  v_address_user_id uuid;
  v_calculated_total numeric;
BEGIN
  SELECT is_blocked INTO v_user_blocked FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  IF v_user_blocked = true THEN
    RAISE EXCEPTION 'Usuário bloqueado';
  END IF;
  
  SELECT user_id INTO v_address_user_id FROM addresses WHERE id = p_address_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endereço não encontrado';
  END IF;
  IF v_address_user_id != p_user_id THEN
    RAISE EXCEPTION 'Endereço não pertence ao usuário';
  END IF;
  
  IF p_subtotal < 0 OR p_delivery_fee < 0 OR p_total < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;
  
  IF p_discount < 0 OR p_discount > p_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;
  
  v_calculated_total := p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0);
  IF ABS(v_calculated_total - p_total) > 0.10 THEN
    RAISE EXCEPTION 'Cálculo do total inconsistente';
  END IF;
  
  IF p_payment_method = 'cash' AND p_change_for IS NOT NULL THEN
    IF p_change_for < p_total THEN
      RAISE EXCEPTION 'Valor para troco menor que o total';
    END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, order_type, status, subtotal, delivery_fee, 
    delivery_distance, discount, total, payment_method, change_for, notes
  )
  VALUES (
    p_user_id, p_address_id, 'delivery', 'pending', p_subtotal, p_delivery_fee,
    COALESCE(p_delivery_distance, 0), p_discount, p_total, p_payment_method, p_change_for, p_notes
  )
  RETURNING id INTO new_order_id;
  
  RETURN new_order_id;
END;
$function$;
