-- Reescreve delete_order: NÃO restaura estoque, e limpa referências bloqueantes
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mp_payment_id text;
  v_status order_status;
BEGIN
  -- GUARDA: nunca deletar pedido com PIX pago/confirmado (exceto cancelado)
  SELECT mp_payment_id, status INTO v_mp_payment_id, v_status
  FROM public.orders
  WHERE id = p_order_id;

  IF v_mp_payment_id IS NOT NULL AND length(trim(v_mp_payment_id)) > 0 AND v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'PEDIDO_PIX_PROTEGIDO: Pedido % possui pagamento PIX (MP #%) e não pode ser excluído. Cancele primeiro se necessário.', p_order_id, v_mp_payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Liberar cupons usados (devolve cupom ao cliente para reuso)
  UPDATE public.user_coupons
  SET is_used = false,
      used_at = NULL,
      used_in_order_id = NULL
  WHERE used_in_order_id = p_order_id;

  -- Apagar comprovantes de pagamento (sem FK formal, mas por integridade lógica)
  DELETE FROM public.payment_confirmations WHERE order_id = p_order_id;

  -- Soltar referências em audit/logs (sem FK CASCADE)
  UPDATE public.pix_payment_audit SET order_id = NULL WHERE order_id = p_order_id;

  -- order_items: ON DELETE CASCADE já cuida
  -- motoboy_locations / ifood_test_events_log: ON DELETE SET NULL já cuida

  -- Excluir o pedido SEM restaurar estoque
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$function$;