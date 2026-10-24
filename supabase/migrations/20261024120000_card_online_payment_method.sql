-- Pagamento online com cartão (Mercado Pago Checkout Pro).
-- 'card_online' é distinto de 'card_credit'/'card_debit' (maquininha do PDV) porque o pedido
-- só pode avançar depois que o webhook do Mercado Pago confirmar o pagamento.
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card_online';

CREATE OR REPLACE FUNCTION public.enforce_pix_payment_before_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_external boolean;
BEGIN
  -- Pedidos de plataformas externas (iFood/99food) têm o pagamento controlado
  -- pela própria plataforma — a trava do webhook MP não se aplica a eles.
  v_is_external := NEW.external_origin IS NOT NULL
    OR LOWER(COALESCE(NEW.salesperson, '')) IN ('ifood', '99food', 'ifood_test');

  IF NOT v_is_external
     AND NEW.payment_method::text IN ('pix', 'card_online')
     AND NEW.status NOT IN ('pending'::order_status, 'cancelled'::order_status)
     AND COALESCE(NEW.payment_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido online (PIX/cartão) não pode avançar sem confirmação de pagamento (webhook/polling do Mercado Pago).';
  END IF;
  RETURN NEW;
END;
$$;
