
-- RPC to deduct doses from an open bottle atomically
CREATE OR REPLACE FUNCTION public.deduct_bottle_doses(
  p_bottle_id UUID,
  p_doses_used INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
  v_total INTEGER;
BEGIN
  SELECT remaining_doses, total_doses INTO v_remaining, v_total
  FROM open_bottles WHERE id = p_bottle_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;
  
  IF p_doses_used > v_remaining THEN
    RAISE EXCEPTION 'Doses insuficientes. Disponível: %, Solicitado: %', v_remaining, p_doses_used;
  END IF;
  
  UPDATE open_bottles
  SET remaining_doses = remaining_doses - p_doses_used,
      is_empty = CASE WHEN (remaining_doses - p_doses_used) <= 0 THEN true ELSE false END,
      emptied_at = CASE WHEN (remaining_doses - p_doses_used) <= 0 THEN now() ELSE emptied_at END
  WHERE id = p_bottle_id;
END;
$$;

-- RPC to deduct stock from a product atomically
CREATE OR REPLACE FUNCTION public.deduct_product_stock(
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(0, stock - p_quantity)
  WHERE id = p_product_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
END;
$$;
