-- Criar função para listar sessões de caixa (bypass RLS)
CREATE OR REPLACE FUNCTION public.get_cash_register_sessions()
RETURNS SETOF cash_register_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM cash_register_sessions
  ORDER BY opened_at DESC
  LIMIT 50;
END;
$$;