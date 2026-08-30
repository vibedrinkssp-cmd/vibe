-- Adicionar tabela motoboys ao realtime para invalidação imediata do cache quando novos motoboys se cadastram
ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboys;
ALTER TABLE public.motoboys REPLICA IDENTITY FULL;