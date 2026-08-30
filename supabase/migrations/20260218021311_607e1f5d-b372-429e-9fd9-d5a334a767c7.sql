
-- RPC para cliente cancelar seu próprio pedido (somente pendentes)
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_user_id uuid, p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE orders
  SET status = 'cancelled',
      notes = COALESCE(notes || ' | ', '') || '❌ Cancelado pelo cliente'
  WHERE id = p_order_id
    AND user_id = p_user_id
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou não pode ser cancelado';
  END IF;
  
  RETURN true;
END;
$$;

-- RPC para buscar itens de pedidos de um usuário específico
CREATE OR REPLACE FUNCTION public.get_user_order_items(p_user_id uuid, p_order_ids uuid[])
RETURNS SETOF order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT oi.* FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE oi.order_id = ANY(p_order_ids)
    AND o.user_id = p_user_id;
END;
$$;

-- RPC para buscar motoboy público por ID (sem dados sensíveis)
CREATE OR REPLACE FUNCTION public.get_motoboy_public(p_motoboy_id uuid)
RETURNS TABLE(id uuid, name text, is_active boolean, current_latitude numeric, current_longitude numeric, location_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.name, m.is_active, m.current_latitude, m.current_longitude, m.location_updated_at
  FROM motoboys m
  WHERE m.id = p_motoboy_id;
END;
$$;
