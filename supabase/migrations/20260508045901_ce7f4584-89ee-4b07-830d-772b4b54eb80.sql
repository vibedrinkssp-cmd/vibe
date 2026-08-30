DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'motoboy_cash_confirmations_order_id_unique'
      AND conrelid = 'public.motoboy_cash_confirmations'::regclass
  ) THEN
    ALTER TABLE public.motoboy_cash_confirmations
      ADD CONSTRAINT motoboy_cash_confirmations_order_id_unique UNIQUE (order_id);
  END IF;
END $$;