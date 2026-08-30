
-- Add Mercado Pago payment ID to orders for reconciliation
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mp_payment_id text;

-- Index for quick lookup by payment ID
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON public.orders(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
