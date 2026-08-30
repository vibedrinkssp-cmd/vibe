-- Corrige pedidos do iFood que foram gravados como 'cash' mas estavam pagos online ("Online - OUTROS").
-- Esses pagamentos NÃO entram no caixa físico - foram pagos pela plataforma.
UPDATE public.orders
SET payment_method = 'pix'::payment_method
WHERE salesperson ILIKE '%ifood%'
  AND payment_method = 'cash'
  AND notes ~* 'pagamento":"Online'
  AND notes ~* 'status_pgto":"Pago';