-- Tabela de nomes aprendidos pelo totem
CREATE TABLE IF NOT EXISTS public.totem_customer_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_normalized text NOT NULL UNIQUE,
  display_name text NOT NULL,
  use_count integer NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_totem_names_prefix
  ON public.totem_customer_names (name_normalized text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_totem_names_use_count
  ON public.totem_customer_names (use_count DESC, last_used_at DESC);

ALTER TABLE public.totem_customer_names ENABLE ROW LEVEL SECURITY;

-- Leitura pública (totem opera sem login do cliente)
DROP POLICY IF EXISTS "Public read totem names" ON public.totem_customer_names;
CREATE POLICY "Public read totem names"
ON public.totem_customer_names FOR SELECT
TO public
USING (true);

-- Escrita pública (apenas via funções abaixo)
DROP POLICY IF EXISTS "Public insert totem names" ON public.totem_customer_names;
CREATE POLICY "Public insert totem names"
ON public.totem_customer_names FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Public update totem names" ON public.totem_customer_names;
CREATE POLICY "Public update totem names"
ON public.totem_customer_names FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- RPC: registra/incrementa um nome usado pelo cliente
CREATE OR REPLACE FUNCTION public.increment_totem_name(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_display text;
BEGIN
  IF p_name IS NULL THEN RETURN; END IF;
  v_display := btrim(p_name);
  IF length(v_display) < 2 OR length(v_display) > 60 THEN RETURN; END IF;

  v_norm := lower(unaccent(v_display));

  INSERT INTO public.totem_customer_names (name_normalized, display_name, use_count, last_used_at)
  VALUES (v_norm, upper(v_display), 1, now())
  ON CONFLICT (name_normalized)
  DO UPDATE SET
    use_count = public.totem_customer_names.use_count + 1,
    last_used_at = now(),
    display_name = upper(v_display);
END;
$$;

-- RPC: busca sugestões para autocomplete
CREATE OR REPLACE FUNCTION public.search_totem_names(p_prefix text, p_limit integer DEFAULT 8)
RETURNS TABLE (display_name text, use_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
BEGIN
  IF p_prefix IS NULL OR length(btrim(p_prefix)) = 0 THEN
    RETURN QUERY
    SELECT t.display_name, t.use_count
    FROM public.totem_customer_names t
    ORDER BY t.use_count DESC, t.last_used_at DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  v_norm := lower(unaccent(btrim(p_prefix)));

  RETURN QUERY
  SELECT t.display_name, t.use_count
  FROM public.totem_customer_names t
  WHERE t.name_normalized LIKE v_norm || '%'
  ORDER BY t.use_count DESC, length(t.name_normalized) ASC, t.last_used_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_totem_name(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_totem_names(text, integer) TO anon, authenticated;