-- 1. Coluna explícita para itens de wizard
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS is_wizard_item boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_order_items_wizard
  ON public.order_items (order_id) WHERE is_wizard_item = true;

-- Backfill: itens sem product_id cujo nome indica drink montado
UPDATE public.order_items
SET is_wizard_item = true
WHERE product_id IS NULL
  AND (
    product_name ILIKE '%caipirinha%' OR
    product_name ILIKE '%copão%' OR
    product_name ILIKE '%copao%' OR
    product_name ILIKE '%drink%' OR
    product_name ILIKE '%batida%' OR
    product_name ILIKE '%monte seu%' OR
    product_name ILIKE '%caipi%ice%' OR
    product_name ILIKE '%combo%personalizado%'
  );

-- 2. Auto-aceite universal de pedidos
CREATE OR REPLACE FUNCTION public.auto_accept_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- PIX aguarda confirmação de pagamento; demais formas de pagamento entram já aceitas
  IF NEW.status = 'pending' AND NEW.payment_method <> 'pix' THEN
    NEW.status := 'accepted';
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_accept_order ON public.orders;
CREATE TRIGGER trg_auto_accept_order
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_accept_order();

-- 3. Quando PIX é confirmado, também transiciona automaticamente para accepted
CREATE OR REPLACE FUNCTION public.auto_accept_on_pix_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_confirmed = true
     AND (OLD.payment_confirmed IS DISTINCT FROM true)
     AND NEW.status = 'pending' THEN
    NEW.status := 'accepted';
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_accept_on_pix_confirm ON public.orders;
CREATE TRIGGER trg_auto_accept_on_pix_confirm
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_accept_on_pix_confirm();