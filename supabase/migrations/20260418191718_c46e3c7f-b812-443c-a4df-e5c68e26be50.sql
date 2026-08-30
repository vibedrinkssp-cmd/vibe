-- 1) Create confirm_pickup_motoboy RPC: motoboy marks the order as picked up
CREATE OR REPLACE FUNCTION public.confirm_pickup_motoboy(
  p_motoboy_id uuid,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND motoboy_id = p_motoboy_id) THEN
    RAISE EXCEPTION 'Pedido não atribuído a este motoboy';
  END IF;

  UPDATE orders
    SET picked_up_at = now(),
        status = CASE WHEN status IN ('accepted','ready') THEN 'dispatched'::order_status ELSE status END,
        dispatched_at = COALESCE(dispatched_at, now())
  WHERE id = p_order_id AND motoboy_id = p_motoboy_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_pickup_motoboy(uuid, uuid) TO anon, authenticated;

-- 2) Refactor assign_motoboy: assign without forcing pickup state.
--    Sets status to 'dispatched' so motoboy can see the order in their panel,
--    but keeps picked_up_at = NULL so KDE/LOG/Admin can still re-assign until pickup.
CREATE OR REPLACE FUNCTION public.assign_motoboy(
  p_order_id uuid,
  p_motoboy_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE orders
    SET motoboy_id = p_motoboy_id,
        status = CASE WHEN status IN ('accepted','ready') THEN 'dispatched'::order_status ELSE status END,
        dispatched_at = COALESCE(dispatched_at, now()),
        -- Reset picked_up_at only if a different motoboy was previously assigned and had picked up
        -- For a fresh assignment or reassignment before pickup, keep NULL
        picked_up_at = CASE WHEN motoboy_id IS DISTINCT FROM p_motoboy_id THEN NULL ELSE picked_up_at END
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_motoboy(uuid, uuid) TO anon, authenticated;