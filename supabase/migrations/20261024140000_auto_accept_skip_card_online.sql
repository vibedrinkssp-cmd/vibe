-- Corrige o cartão online (Mercado Pago Checkout Pro): o auto-aceite de pedidos novos
-- (trg_auto_accept_order) só poupava 'pix', então um pedido 'card_online' nascia 'accepted'
-- e a trava enforce_pix_payment_before_progress rejeitava o INSERT com
-- "Pedido online (PIX/cartão) não pode avançar sem confirmação de pagamento".
-- Agora 'card_online' também fica 'pending' até o webhook confirmar; ao confirmar,
-- auto_accept_on_pix_confirm já move pending -> accepted.
CREATE OR REPLACE FUNCTION public.auto_accept_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PIX e cartão online aguardam confirmação de pagamento; demais formas entram já aceitas
  IF NEW.status = 'pending' AND NEW.payment_method::text NOT IN ('pix', 'card_online') THEN
    NEW.status := 'accepted';
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
