
CREATE OR REPLACE FUNCTION public.suggest_product_for_ifood_item(p_name text)
 RETURNS TABLE(product_id uuid, product_name text, source text, score real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm text := public.normalize_ifood_alias(p_name);
BEGIN
  -- 1) alias exato
  RETURN QUERY
    SELECT p.id, p.name, 'alias'::text, 1.0::real
      FROM public.ifood_product_aliases a
      JOIN public.products p ON p.id = a.product_id
     WHERE a.alias_normalized = v_norm
     LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 2) match exato por nome normalizado
  RETURN QUERY
    SELECT p.id, p.name, 'exact'::text, 0.95::real
      FROM public.products p
     WHERE public.normalize_ifood_alias(p.name) = v_norm
     LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- 3) fuzzy por similaridade de prefixos / contém
  RETURN QUERY
    SELECT p.id, p.name, 'fuzzy'::text,
           (1.0 - (abs(length(p.name) - length(v_norm))::real / GREATEST(length(v_norm), 1)))::real AS score
      FROM public.products p
     WHERE (
         public.normalize_ifood_alias(p.name) LIKE '%' || v_norm || '%'
         OR v_norm LIKE '%' || public.normalize_ifood_alias(p.name) || '%'
       )
     ORDER BY score DESC NULLS LAST
     LIMIT 3;
END;
$function$;


CREATE OR REPLACE FUNCTION public.sync_ifood_order_stock(p_order_id uuid, p_items jsonb, p_synced_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_product_id uuid;
  v_bottle_id uuid;
  v_target_type text;
  v_qty integer;
  v_action text;
  v_original text;
  v_synced_products integer := 0;
  v_synced_bottles integer := 0;
  v_ignored_count integer := 0;
  v_total_units integer := 0;
  v_current_stock integer;
  v_bottle_product uuid;
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
    v_action      := coalesce(v_item->>'action', 'ignore');
    v_original    := v_item->>'original_name';
    v_qty         := coalesce((v_item->>'quantity')::int, 0);
    v_target_type := coalesce(v_item->>'target_type', 'product');
    v_product_id  := NULLIF(v_item->>'product_id', '')::uuid;
    v_bottle_id   := NULLIF(v_item->>'bottle_id', '')::uuid;

    IF v_action = 'sync' AND v_qty > 0 AND v_target_type = 'bottle' AND v_bottle_id IS NOT NULL THEN
      -- baixa de doses de garrafa aberta
      SELECT product_id INTO v_bottle_product
        FROM public.open_bottles
       WHERE id = v_bottle_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Garrafa % não encontrada', v_bottle_id;
      END IF;

      PERFORM public.deduct_bottle_doses(v_bottle_id, v_qty);

      INSERT INTO public.stock_sync_log
        (order_id, product_id, quantity, original_item_name, is_sentinel, synced_by)
      VALUES
        (p_order_id, v_bottle_product, v_qty, v_original, false, p_synced_by);

      IF v_original IS NOT NULL AND length(trim(v_original)) > 0 AND v_bottle_product IS NOT NULL THEN
        INSERT INTO public.ifood_product_aliases
          (alias_normalized, product_id, hits, last_used_at)
        VALUES
          (public.normalize_ifood_alias(v_original), v_bottle_product, 1, now())
        ON CONFLICT (alias_normalized) DO UPDATE
          SET product_id   = EXCLUDED.product_id,
              hits         = public.ifood_product_aliases.hits + 1,
              last_used_at = now();
      END IF;

      v_synced_bottles := v_synced_bottles + 1;
      v_total_units    := v_total_units + v_qty;

    ELSIF v_action = 'sync' AND v_product_id IS NOT NULL AND v_qty > 0 THEN
      -- baixa de produto (fabricado ou industrializado)
      SELECT coalesce(stock, 0)
        INTO v_current_stock
        FROM public.products
       WHERE id = v_product_id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto % não encontrado', v_product_id;
      END IF;

      UPDATE public.products
         SET stock = GREATEST(0, v_current_stock - v_qty)
       WHERE id = v_product_id;

      INSERT INTO public.stock_sync_log
        (order_id, product_id, quantity, original_item_name, is_sentinel, synced_by)
      VALUES
        (p_order_id, v_product_id, v_qty, v_original, false, p_synced_by);

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

      v_synced_products := v_synced_products + 1;
      v_total_units     := v_total_units + v_qty;
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
    'synced_count', v_synced_products + v_synced_bottles,
    'synced_products', v_synced_products,
    'synced_bottles', v_synced_bottles,
    'ignored_count', v_ignored_count,
    'total_units', v_total_units
  );
END;
$function$;
