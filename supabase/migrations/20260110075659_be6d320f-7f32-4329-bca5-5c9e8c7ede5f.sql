-- Criar função para listar todas as sangrias (bypass RLS)
CREATE OR REPLACE FUNCTION public.get_all_sangrias_list(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF sangrias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM sangrias
  WHERE 
    (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  ORDER BY created_at DESC
  LIMIT 100;
END;
$$;

-- Criar função para inserir sangria (bypass RLS)
CREATE OR REPLACE FUNCTION public.insert_sangria(
  p_type TEXT,
  p_amount NUMERIC,
  p_responsible TEXT,
  p_description TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sangria_id UUID;
BEGIN
  INSERT INTO sangrias (type, amount, responsible, description, reason)
  VALUES (p_type, p_amount, p_responsible, p_description, p_reason)
  RETURNING id INTO v_sangria_id;
  
  RETURN v_sangria_id;
END;
$$;