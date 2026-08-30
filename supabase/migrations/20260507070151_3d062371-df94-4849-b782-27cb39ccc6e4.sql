CREATE OR REPLACE FUNCTION public.assign_motoboy_atomic(p_order_id uuid, p_motoboy_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order orders%ROWTYPE;
  v_motoboy motoboys%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  SELECT * INTO v_motoboy FROM motoboys WHERE id = p_motoboy_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy não encontrado');
  END IF;
  IF NOT v_motoboy.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy inativo');
  END IF;

  PERFORM public._sync_motoboy_to_users(v_motoboy.id, v_motoboy.name, v_motoboy.whatsapp, v_motoboy.password);

  UPDATE orders
    SET motoboy_id = p_motoboy_id,
        status = CASE WHEN status IN ('accepted','preparing','ready') THEN 'dispatched'::order_status ELSE status END,
        dispatched_at = COALESCE(dispatched_at, now()),
        picked_up_at = CASE WHEN motoboy_id IS DISTINCT FROM p_motoboy_id THEN NULL ELSE picked_up_at END
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'motoboy_id', p_motoboy_id,
    'motoboy_name', v_motoboy.name
  );
END;
$function$;

-- Corrigir pedidos atualmente atribuídos mas presos em preparing/accepted/ready
UPDATE orders
  SET status = 'dispatched'::order_status,
      dispatched_at = COALESCE(dispatched_at, now())
WHERE motoboy_id IS NOT NULL
  AND status IN ('accepted','preparing','ready');