
-- ===========================================================
-- iFood Stock Sync — Wizard de baixa manual de estoque
-- ===========================================================

-- 1) Tabela de log de sincronização
CREATE TABLE IF NOT EXISTS public.stock_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL,
  product_id uuid NULL,            -- NULL = item ignorado / sentinela "pedido revisado"
  quantity integer NOT NULL DEFAULT 0,
  original_item_name text NULL,
  is_sentinel boolean NOT NULL DEFAULT false,
  synced_by text NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_stock_sync_log_sentinel
  ON public.stock_sync_log (order_id) WHERE is_sentinel = true;

CREATE INDEX IF NOT EXISTS idx_stock_sync_log_order ON public.stock_sync_log (order_id);
CREATE INDEX IF NOT EXISTS idx_stock_sync_log_product ON public.stock_sync_log (product_id);

ALTER TABLE public.stock_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lê stock_sync_log" ON public.stock_sync_log;
CREATE POLICY "Admin lê stock_sync_log" ON public.stock_sync_log
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role gerencia stock_sync_log" ON public.stock_sync_log;
CREATE POLICY "Service role gerencia stock_sync_log" ON public.stock_sync_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Tabela de aliases aprendidos
CREATE TABLE IF NOT EXISTS public.ifood_product_aliases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alias_normalized text NOT NULL,
  product_id uuid NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ifood_alias
  ON public.ifood_product_aliases (alias_normalized);

ALTER TABLE public.ifood_product_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin lê ifood_product_aliases" ON public.ifood_product_aliases;
CREATE POLICY "Admin lê ifood_product_aliases" ON public.ifood_product_aliases
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role gerencia ifood_product_aliases" ON public.ifood_product_aliases;
CREATE POLICY "Service role gerencia ifood_product_aliases" ON public.ifood_product_aliases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Realtime para badges
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_sync_log;

-- 3) Helper de normalização
CREATE OR REPLACE FUNCTION public.normalize_ifood_alias(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(
    regexp_replace(
      trim(
        translate(
          coalesce(split_part(split_part(p_text, E'\n', 1), '[PDV:', 1), ''),
          'áàâãäéèêëíìîïóòôõöúùûüç',
          'aaaaaeeeeiiiiooooouuuuc'
        )
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- 4) RPC principal: baixa de estoque
CREATE OR REPLACE FUNCTION public.sync_ifood_order_stock(
  p_order_id uuid,
  p_items jsonb,
  p_synced_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_action text;
  v_original text;
  v_is_prepared boolean;
  v_synced_count integer := 0;
  v_ignored_count integer := 0;
  v_total_units integer := 0;
  v_current_stock integer;
BEGIN
  -- valida pedido
  SELECT id, external_origin, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;

  IF v_order.external_origin IS NULL OR v_order.external_origin NOT LIKE 'ifood%' THEN
    RAISE EXCEPTION 'Pedido não é iFood (origem: %)', coalesce(v_order.external_origin, 'null');
  END IF;

  -- idempotência via sentinela única
  IF EXISTS (SELECT 1 FROM public.stock_sync_log
              WHERE order_id = p_order_id AND is_sentinel = true) THEN
    RAISE EXCEPTION 'Pedido já foi sincronizado anteriormente';
  END IF;

  -- processa itens
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    v_action     := coalesce(v_item->>'action', 'ignore');
    v_original   := v_item->>'original_name';
    v_qty        := coalesce((v_item->>'quantity')::int, 0);
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;

    IF v_action = 'sync' AND v_product_id IS NOT NULL AND v_qty > 0 THEN
      SELECT coalesce(is_prepared, false), coalesce(stock, 0)
        INTO v_is_prepared, v_current_stock
        FROM public.products
       WHERE id = v_product_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto % não encontrado', v_product_id;
      END IF;

      IF NOT v_is_prepared THEN
        RAISE EXCEPTION 'Produto % não é fabricado (is_prepared=false)', v_product_id;
      END IF;

      UPDATE public.products
         SET stock = GREATEST(0, v_current_stock - v_qty)
       WHERE id = v_product_id;

      INSERT INTO public.stock_sync_log
        (order_id, product_id, quantity, original_item_name, is_sentinel, synced_by)
      VALUES
        (p_order_id, v_product_id, v_qty, v_original, false, p_synced_by);

      -- aprende alias
      IF v_original IS NOT NULL AND length(trim(v_original)) > 0 THEN
        INSERT INTO public.ifood_product_aliases
          (alias_normalized, product_id, hits, last_used_at)
        VALUES
          (public.normalize_ifood_alias(v_original), v_product_id, 1, now())
        ON CONFLICT (alias_normalized) DO UPDATE
          SET product_id   = EXCLUDED.product_id,
              hits         = public.ifood_product_aliases.hits + 1,
              last_used_at = now();
      END IF;

      v_synced_count := v_synced_count + 1;
      v_total_units  := v_total_units + v_qty;
    ELSE
      INSERT INTO public.stock_sync_log
        (order_id, product_id, quantity, original_item_name, is_sentinel, synced_by)
      VALUES
        (p_order_id, NULL, 0, v_original, false, p_synced_by);
      v_ignored_count := v_ignored_count + 1;
    END IF;
  END LOOP;

  -- sentinela final
  INSERT INTO public.stock_sync_log
    (order_id, product_id, quantity, original_item_name, is_sentinel, synced_by)
  VALUES
    (p_order_id, NULL, v_total_units, '__SENTINEL__', true, p_synced_by);

  RETURN jsonb_build_object(
    'ok', true,
    'synced_count', v_synced_count,
    'ignored_count', v_ignored_count,
    'total_units', v_total_units
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_ifood_order_stock(uuid, jsonb, text) TO authenticated, anon;

-- 5) RPC: status de sincronização (batch)
CREATE OR REPLACE FUNCTION public.get_ifood_sync_status(p_order_ids uuid[])
RETURNS TABLE (
  order_id uuid,
  synced_at timestamptz,
  synced_by text,
  items_count integer,
  total_units integer
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    s.order_id,
    s.synced_at,
    s.synced_by,
    (SELECT count(*)::int FROM public.stock_sync_log x
       WHERE x.order_id = s.order_id AND x.product_id IS NOT NULL)::int AS items_count,
    s.quantity AS total_units
  FROM public.stock_sync_log s
  WHERE s.is_sentinel = true
    AND s.order_id = ANY(p_order_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_ifood_sync_status(uuid[]) TO authenticated, anon;

-- 6) RPC: sugestão de produto fabricado para um nome iFood
CREATE OR REPLACE FUNCTION public.suggest_product_for_ifood_item(p_name text)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  source text,
  score real
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := public.normalize_ifood_alias(p_name);
BEGIN
  -- 1) alias exato
  RETURN QUERY
    SELECT p.id, p.name, 'alias'::text, 1.0::real
      FROM public.ifood_product_aliases a
      JOIN public.products p ON p.id = a.product_id
     WHERE a.alias_normalized = v_norm
       AND coalesce(p.is_prepared, false) = true
     LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 2) match exato por nome normalizado
  RETURN QUERY
    SELECT p.id, p.name, 'exact'::text, 0.95::real
      FROM public.products p
     WHERE coalesce(p.is_prepared, false) = true
       AND public.normalize_ifood_alias(p.name) = v_norm
     LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 3) fuzzy por similaridade de prefixos / contém
  RETURN QUERY
    SELECT p.id, p.name, 'fuzzy'::text,
           (1.0 - (abs(length(p.name) - length(v_norm))::real / GREATEST(length(v_norm), 1)))::real AS score
      FROM public.products p
     WHERE coalesce(p.is_prepared, false) = true
       AND (
         public.normalize_ifood_alias(p.name) LIKE '%' || v_norm || '%'
         OR v_norm LIKE '%' || public.normalize_ifood_alias(p.name) || '%'
       )
     ORDER BY score DESC NULLS LAST
     LIMIT 3;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_product_for_ifood_item(text) TO authenticated, anon;
