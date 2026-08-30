-- Corrige pedidos externos antigos que foram salvos como 'cash' mas eram pagamento online da plataforma
UPDATE public.orders
SET payment_method = 'pix',
    payment_confirmed = true,
    payment_confirmed_at = COALESCE(payment_confirmed_at, created_at),
    payment_confirmed_by = COALESCE(payment_confirmed_by, salesperson || ' (online)')
WHERE salesperson IN ('ifood','rappi','99food','keeta','uber_eats')
  AND payment_method = 'cash'
  AND notes LIKE '%"status_pgto":"Pago"%';