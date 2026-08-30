-- SINISTRO: força reversão/avanço de status mesmo de pedidos cancelled/delivered
CREATE OR REPLACE FUNCTION public.sinistro_revert_order_status(
  p_order_id uuid,
  p_new_status order_status,
  p_responsible text DEFAULT 'admin',
  p_reason text DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order orders;
  v_now timestamptz := now();
  v_old_status order_status;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;

  v_old_status := v_order.status;

  -- Atualiza status forçado e ajusta timestamps:
  --   - preenche timestamps anteriores que faltam (linha do tempo coerente)
  --   - LIMPA timestamps de etapas posteriores ao novo status (rollback verdadeiro)
  --   - se voltar antes de "dispatched", desvincula motoboy
  UPDATE orders SET
    status = p_new_status,

    accepted_at = CASE
      WHEN p_new_status = 'pending' THEN NULL
      WHEN p_new_status IN ('accepted','preparing','ready','dispatched','delivered') AND accepted_at IS NULL THEN v_now
      WHEN p_new_status = 'cancelled' THEN accepted_at
      ELSE accepted_at
    END,

    preparing_at = CASE
      WHEN p_new_status IN ('pending','accepted') THEN NULL
      WHEN p_new_status IN ('preparing','ready','dispatched','delivered') AND preparing_at IS NULL THEN v_now
      ELSE preparing_at
    END,

    ready_at = CASE
      WHEN p_new_status IN ('pending','accepted','preparing') THEN NULL
      WHEN p_new_status IN ('ready','dispatched','delivered') AND ready_at IS NULL THEN v_now
      ELSE ready_at
    END,

    dispatched_at = CASE
      WHEN p_new_status IN ('pending','accepted','preparing','ready') THEN NULL
      WHEN p_new_status IN ('dispatched','delivered') AND dispatched_at IS NULL THEN v_now
      ELSE dispatched_at
    END,

    arrived_at = CASE
      WHEN p_new_status IN ('pending','accepted','preparing','ready','dispatched') THEN NULL
      ELSE arrived_at
    END,

    delivered_at = CASE
      WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN v_now
      WHEN p_new_status <> 'delivered' THEN NULL
      ELSE delivered_at
    END,

    motoboy_id = CASE
      WHEN p_new_status IN ('pending','accepted','preparing','ready') THEN NULL
      ELSE motoboy_id
    END
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  -- Registra auditoria do sinistro em cash_register_audit (tabela genérica de auditoria existente)
  INSERT INTO cash_register_audit (action, responsible, notes)
  VALUES (
    'order_status_sinistro',
    COALESCE(p_responsible, 'admin'),
    format('Pedido %s | %s -> %s | motivo: %s', p_order_id::text, v_old_status::text, p_new_status::text, COALESCE(p_reason, '(sem motivo)'))
  );

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sinistro_revert_order_status(uuid, order_status, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sinistro_revert_order_status(uuid, order_status, text, text) FROM anon;