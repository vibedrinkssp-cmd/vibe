CREATE OR REPLACE FUNCTION public.confirm_delivery_payment(p_order_id uuid, p_responsible text DEFAULT 'admin'::text, p_as_cash boolean DEFAULT false, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_final_amount numeric;
BEGIN
  SELECT id, payment_method, payment_confirmed, total, status, original_payment_method
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  IF p_as_cash THEN
    v_final_amount := COALESCE(p_amount, v_order.total);
    UPDATE public.orders
    SET original_payment_method = COALESCE(original_payment_method, payment_method::text),
        payment_method = 'cash',
        cash_received = v_final_amount,
        payment_confirmed = true,
        payment_confirmed_at = now(),
        payment_confirmed_by = COALESCE(p_responsible, 'admin')
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'as_cash', true, 'amount', v_final_amount);
  ELSE
    UPDATE public.orders
    SET payment_confirmed = true,
        payment_confirmed_at = now(),
        payment_confirmed_by = COALESCE(p_responsible, 'admin')
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'as_cash', false, 'amount', v_order.total);
  END IF;
END;
$function$;