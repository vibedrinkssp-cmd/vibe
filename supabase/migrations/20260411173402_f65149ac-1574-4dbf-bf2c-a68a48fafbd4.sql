
CREATE OR REPLACE FUNCTION public.create_counter_order(
  p_user_id uuid DEFAULT NULL,
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_payment_method payment_method DEFAULT 'cash',
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_name text DEFAULT 'Balconista',
  p_salesperson text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order_id uuid;
  v_calculated_total numeric;
BEGIN
  -- Log para debug
  RAISE LOG 'create_counter_order: subtotal=%, delivery_fee=%, discount=%, total=%, calculated=%',
    p_subtotal, p_delivery_fee, p_discount, p_total, (p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0));

  IF p_subtotal < 0 THEN
    RAISE EXCEPTION 'Subtotal não pode ser negativo';
  END IF;
  
  IF p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'Taxa de entrega não pode ser negativa';
  END IF;
  
  IF p_discount < 0 OR p_discount > p_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;
  
  IF p_total < 0 THEN
    RAISE EXCEPTION 'Total não pode ser negativo';
  END IF;
  
  -- Validar cálculo do total (tolerância de R$0.10)
  v_calculated_total := p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0);
  IF ABS(v_calculated_total - p_total) > 0.10 THEN
    RAISE EXCEPTION 'Cálculo do total inconsistente: subtotal=%, fee=%, discount=%, total=%, calc=%',
      p_subtotal, p_delivery_fee, p_discount, p_total, v_calculated_total;
  END IF;
  
  IF p_payment_method = 'cash' AND p_change_for IS NOT NULL THEN
    IF p_change_for < p_total THEN
      RAISE EXCEPTION 'Valor para troco menor que o total';
    END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, order_type, status, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, customer_name, salesperson
  )
  VALUES (
    p_user_id, 'counter', 'accepted', p_subtotal, p_delivery_fee, p_discount, p_total,
    p_payment_method, p_change_for, p_notes, p_customer_name, p_salesperson
  )
  RETURNING id INTO new_order_id;
  
  RETURN new_order_id;
END;
$$;
