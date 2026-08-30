-- Drop old non-unique index and replace with unique partial index
DROP INDEX IF EXISTS public.idx_orders_mp_payment_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_mp_payment_id
  ON public.orders(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;
