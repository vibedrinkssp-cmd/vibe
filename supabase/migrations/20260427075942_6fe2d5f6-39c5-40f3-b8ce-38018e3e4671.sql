-- Estende motoboy_cash_confirmations para suportar baixa por pedido individual
ALTER TABLE public.motoboy_cash_confirmations
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS payment_method text;

-- Garante que cada pedido só possa ter uma baixa ativa
CREATE UNIQUE INDEX IF NOT EXISTS uq_motoboy_cash_conf_order
  ON public.motoboy_cash_confirmations(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_motoboy_cash_conf_order
  ON public.motoboy_cash_confirmations(order_id);