-- Garantir que orders, order_items e motoboy_locations estejam na publicação realtime.
-- Sem isso, INSERT/UPDATE nessas tabelas NÃO disparam eventos realtime no frontend,
-- e o alerta sonoro de novos pedidos não toca de forma confiável.

DO $$
BEGIN
  -- orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
  END IF;

  -- order_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items';
  END IF;

  -- motoboy_locations
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'motoboy_locations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboy_locations';
  END IF;

  -- cash_register_sessions (usado pelo monitor de caixa em tempo real)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cash_register_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_sessions';
  END IF;

  -- sangrias (usado em painéis financeiros)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'sangrias'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sangrias'; 
  END IF;
END $$;

-- Garantir REPLICA IDENTITY FULL para que payload.old e payload.new
-- venham completos (necessário para detectar mudança de status corretamente).
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.motoboy_locations REPLICA IDENTITY FULL;
ALTER TABLE public.cash_register_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.sangrias REPLICA IDENTITY FULL;