
-- Auto-accept orders on insert (except PIX which needs payment confirmation)
CREATE OR REPLACE FUNCTION public.auto_accept_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-accept if status is pending and payment is NOT pix (pix needs confirmation)
  IF NEW.status = 'pending' AND NEW.payment_method != 'pix' THEN
    NEW.status := 'accepted';
    NEW.accepted_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger fires BEFORE INSERT so the row is stored already as 'accepted'
CREATE TRIGGER trg_auto_accept_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_accept_order();
