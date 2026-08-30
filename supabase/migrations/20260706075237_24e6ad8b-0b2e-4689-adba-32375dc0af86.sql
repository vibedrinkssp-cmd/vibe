-- Trava única: um pedido PIX só pode existir/avançar como pedido real quando o
-- pagamento estiver confirmado (via webhook/polling do Mercado Pago).
-- Enquanto não confirmado, permanece 'pending' (oculto das telas operacionais)
-- ou é 'cancelled' pelo cron de expiração.
CREATE OR REPLACE FUNCTION public.enforce_pix_payment_before_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'pix'::payment_method
     AND NEW.status NOT IN ('pending'::order_status, 'cancelled'::order_status)
     AND COALESCE(NEW.payment_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido PIX não pode avançar sem confirmação de pagamento (webhook/polling do Mercado Pago).';
  END IF;
  RETURN NEW;
END;
$$;

-- Garante a regra tanto na criação quanto em qualquer mudança de status.
DROP TRIGGER IF EXISTS trg_enforce_pix_payment_insert ON public.orders;
CREATE TRIGGER trg_enforce_pix_payment_insert
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_pix_payment_before_progress();

DROP TRIGGER IF EXISTS trg_enforce_pix_payment_update ON public.orders;
CREATE TRIGGER trg_enforce_pix_payment_update
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_pix_payment_before_progress();