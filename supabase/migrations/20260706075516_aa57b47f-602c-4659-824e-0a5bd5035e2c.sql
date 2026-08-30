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
  -- pela própria plataforma — a trava do weblook MP não se aplica a eles.
  v_is_external := NEW.external_origin IS NOT NULL
    OR LOWER(COALESCE(NEW.salesperson, '')) IN ('ifood', '99food', 'ifood_test');

  IF NOT v_is_external
     AND NEW.payment_method = 'pix'::payment_method
     AND NEW.status NOT IN ('pending'::order_status, 'cancelled'::order_status)
     AND COALESCE(NEW.payment_confirmed, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Pedido PIX não pode avançar sem confirmação de pagamento (webhook/polling do Mercado Pago).';
  END IF;
  RETURN NEW;
END;
$$;