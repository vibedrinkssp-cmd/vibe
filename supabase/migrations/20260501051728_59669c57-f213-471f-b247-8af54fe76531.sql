-- 1) BACKFILL: marca pedidos antigos como já conferidos
UPDATE public.orders
SET 
  payment_confirmed = true,
  payment_confirmed_at = COALESCE(delivered_at, created_at),
  payment_confirmed_by = 'BACKFILL_AUTOMATICO'
WHERE status = 'delivered'
  AND payment_confirmed IS NOT TRUE
  AND payment_method IN ('card_credit','card_debit','card_pos','pix_pos','pix')
  AND order_type IN ('counter','totem','local','pickup');

-- 2) Registra auditoria do backfill
INSERT INTO public.cash_register_audit (action, responsible, notes)
VALUES (
  'backfill_payment_confirmed',
  'SISTEMA',
  'Backfill automático: marcou pedidos históricos entregues (cartão/PIX balcão/totem/retirada) como conferidos para limpar fila de conferência.'
);

-- 3) Ajusta trigger de "caixa fechado": só bloqueia vendas PRESENCIAIS
CREATE OR REPLACE FUNCTION public.enforce_cash_session_for_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_count INTEGER;
BEGIN
  -- Pedidos online (delivery/pickup feitos pelo cliente) NÃO exigem caixa aberto
  -- pois o pagamento é digital ou será conferido na entrega.
  IF NEW.order_type IN ('delivery','pickup') AND NEW.user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Vendas presenciais (counter/totem/local + delivery interno do PDV) exigem caixa aberto
  SELECT COUNT(*) INTO v_open_count
  FROM public.cash_register_sessions
  WHERE status = 'open';

  IF v_open_count = 0 THEN
    RAISE EXCEPTION 'CAIXA_FECHADO: Não é possível registrar vendas presenciais sem caixa aberto. Abra o caixa em Admin → Caixa.'
      USING ERRCODE = 'P0001', HINT = 'Vá em /admin → aba Caixa → Abrir Caixa';
  END IF;

  RETURN NEW;
END;
$function$;