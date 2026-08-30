
-- Add picked_up_at to track when motoboy confirms pickup
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS picked_up_at timestamp with time zone DEFAULT NULL;

-- Function for motoboy to confirm pickup
CREATE OR REPLACE FUNCTION public.confirm_pickup_motoboy(p_motoboy_id uuid, p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET picked_up_at = now()
  WHERE id = p_order_id
    AND motoboy_id = p_motoboy_id
    AND status = 'dispatched'
    AND picked_up_at IS NULL;
    
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado ou já coletado';
  END IF;
END;
$$;

-- Update assign_motoboy to clear picked_up_at when reassigning
CREATE OR REPLACE FUNCTION public.assign_motoboy(p_order_id uuid, p_motoboy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orders
  SET motoboy_id = p_motoboy_id,
      status = 'dispatched',
      dispatched_at = now(),
      picked_up_at = NULL
  WHERE id = p_order_id;
END;
$$;
