-- Adicionar tabela motoboys ao realtime para invalidação imediata do cache quando novos motoboys se cadastram
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'motoboys'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.motoboys;
  END IF;
END $$;
ALTER TABLE public.motoboys REPLICA IDENTITY FULL;
