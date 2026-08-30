DROP FUNCTION IF EXISTS public.cancel_customer_order(uuid, uuid);

CREATE FUNCTION public.cancel_customer_order(p_order_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET status = 'cancelled',
      notes = COALESCE(notes || ' | ', '') || '❌ Cancelado pelo cliente'
  WHERE id = p_order_id
    AND user_id = p_user_id
    AND status IN ('pending', 'accepted');
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já está em preparo/entrega';
  END IF;
  
  RETURN true;
END;
$$;