
-- Create motoboy-specific RPCs that verify by motoboy ID instead of auth roles

-- 1. Get motoboy's own data by ID
CREATE OR REPLACE FUNCTION public.get_motoboy_self(p_motoboy_id uuid)
RETURNS SETOF motoboys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  RETURN QUERY SELECT * FROM motoboys WHERE id = p_motoboy_id;
END;
$$;

-- 2. Get orders assigned to a specific motoboy
CREATE OR REPLACE FUNCTION public.get_motoboy_orders(p_motoboy_id uuid)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  RETURN QUERY SELECT * FROM orders WHERE motoboy_id = p_motoboy_id ORDER BY created_at DESC;
END;
$$;

-- 3. Get order items for motoboy's orders
CREATE OR REPLACE FUNCTION public.get_motoboy_order_items(p_motoboy_id uuid, p_order_ids uuid[])
RETURNS SETOF order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  -- Only return items for orders assigned to this motoboy
  RETURN QUERY 
    SELECT oi.* FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    WHERE oi.order_id = ANY(p_order_ids) AND o.motoboy_id = p_motoboy_id;
END;
$$;

-- 4. Get addresses for motoboy's orders
CREATE OR REPLACE FUNCTION public.get_motoboy_addresses(p_motoboy_id uuid, p_address_ids uuid[])
RETURNS SETOF addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  -- Only return addresses linked to orders assigned to this motoboy
  RETURN QUERY 
    SELECT a.* FROM addresses a
    WHERE a.id = ANY(p_address_ids)
    AND EXISTS (
      SELECT 1 FROM orders o 
      WHERE o.address_id = a.id AND o.motoboy_id = p_motoboy_id
    );
END;
$$;

-- 5. Get users for motoboy's orders (limited fields for security)
CREATE OR REPLACE FUNCTION public.get_motoboy_order_users(p_motoboy_id uuid)
RETURNS TABLE(id uuid, name text, whatsapp text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  -- Only return users who have orders assigned to this motoboy
  RETURN QUERY 
    SELECT DISTINCT u.id, u.name, u.whatsapp 
    FROM users u
    INNER JOIN orders o ON o.user_id = u.id
    WHERE o.motoboy_id = p_motoboy_id;
END;
$$;

-- 6. Update order status by motoboy (only for their own orders)
CREATE OR REPLACE FUNCTION public.update_order_status_motoboy(
  p_motoboy_id uuid,
  p_order_id uuid,
  p_status order_status,
  p_arrived_at timestamptz DEFAULT NULL,
  p_delivered_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND motoboy_id = p_motoboy_id) THEN
    RAISE EXCEPTION 'Pedido não atribuído a este motoboy';
  END IF;
  
  -- Only allow specific status transitions for motoboy
  IF p_status NOT IN ('arrived', 'delivered') THEN
    RAISE EXCEPTION 'Motoboy só pode marcar como chegou ou entregue';
  END IF;
  
  UPDATE orders SET
    status = p_status,
    arrived_at = COALESCE(p_arrived_at, arrived_at),
    delivered_at = COALESCE(p_delivered_at, delivered_at)
  WHERE id = p_order_id AND motoboy_id = p_motoboy_id;
END;
$$;

-- Grant execute to anon (motoboys use custom auth, not Supabase auth)
GRANT EXECUTE ON FUNCTION public.get_motoboy_self(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_motoboy_orders(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_motoboy_order_items(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_motoboy_addresses(uuid, uuid[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_motoboy_order_users(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_motoboy(uuid, uuid, order_status, timestamptz, timestamptz) TO anon, authenticated;
