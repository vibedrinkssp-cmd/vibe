-- 1. Limpeza imediata das filas travadas (counter/totem/pickup presos em accepted/preparing)
UPDATE public.orders
SET status = 'delivered', delivered_at = now()
WHERE order_type IN ('counter','totem','pickup')
  AND status IN ('accepted','preparing');

-- 2. Função que conclui automaticamente pedidos de retirada prontos há mais de 5 minutos
CREATE OR REPLACE FUNCTION public.auto_complete_pickup_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders
  SET status = 'delivered', delivered_at = now()
  WHERE order_type IN ('counter','totem','pickup')
    AND status = 'ready'
    AND ready_at IS NOT NULL
    AND ready_at < now() - interval '5 minutes';
END;
$$;

-- 3. Garante extensão de agendamento
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 4. Agenda execução a cada minuto (remove agendamento anterior se existir)
DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-pickup-orders');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'auto-complete-pickup-orders',
  '* * * * *',
  $$ SELECT public.auto_complete_pickup_orders(); $$
);