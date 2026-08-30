-- Função RPC para execução segura de SQL dinâmico (apenas SELECT)
CREATE OR REPLACE FUNCTION execute_readonly_query(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  normalized_sql text;
BEGIN
  -- Normalizar a query
  normalized_sql := lower(trim(sql_query));
  
  -- Validar que começa com SELECT
  IF NOT (normalized_sql LIKE 'select%') THEN
    RAISE EXCEPTION 'Apenas consultas SELECT são permitidas';
  END IF;
  
  -- Bloquear palavras perigosas (DDL/DML)
  IF normalized_sql ~* '\b(delete|drop|insert|update|truncate|alter|create|grant|revoke|execute|call)\b' THEN
    RAISE EXCEPTION 'Operação não permitida: apenas SELECT é aceito';
  END IF;
  
  -- Bloquear acesso a schemas sensíveis
  IF normalized_sql ~* '\b(auth\.|storage\.|supabase_functions\.|vault\.|pg_)\b' THEN
    RAISE EXCEPTION 'Acesso a schemas do sistema não é permitido';
  END IF;
  
  -- Executar com limite de 1000 registros para segurança
  EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s LIMIT 1000) t', sql_query) INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro na consulta: %', SQLERRM;
END;
$$;

-- Conceder permissão para usuários autenticados usarem a função
GRANT EXECUTE ON FUNCTION execute_readonly_query(text) TO authenticated;