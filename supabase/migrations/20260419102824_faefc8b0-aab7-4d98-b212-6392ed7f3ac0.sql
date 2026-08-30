-- ============================================
-- RPC ATÔMICA: create_caderneta_entries_batch
-- ============================================
-- Insere múltiplos itens de caderneta em uma única transação.
-- Se qualquer item falhar, TODOS são revertidos automaticamente (atomicidade nativa do Postgres).
CREATE OR REPLACE FUNCTION public.create_caderneta_entries_batch(
  p_customer_id uuid,
  p_items jsonb,
  p_salesperson text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items array is empty';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.caderneta_entries (
      customer_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      salesperson,
      notes
    ) VALUES (
      p_customer_id,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'total_price')::numeric, 0),
      p_salesperson,
      NULLIF(v_item->>'notes', '')
    );
    v_count := v_count + 1;
    v_total := v_total + COALESCE((v_item->>'total_price')::numeric, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_caderneta_entries_batch(uuid, jsonb, text) TO anon, authenticated, service_role;

-- ============================================
-- RPC ATÔMICA: create_platform_sales_batch
-- ============================================
CREATE OR REPLACE FUNCTION public.create_platform_sales_batch(
  p_platform text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_salesperson text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_count int := 0;
  v_total numeric := 0;
BEGIN
  IF p_platform IS NULL OR length(p_platform) = 0 THEN
    RAISE EXCEPTION 'platform is required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items array is empty';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.platform_sales (
      platform,
      product_id,
      product_name,
      quantity,
      unit_price,
      total_price,
      notes,
      salesperson
    ) VALUES (
      p_platform,
      NULLIF(v_item->>'product_id', '')::uuid,
      v_item->>'product_name',
      COALESCE((v_item->>'quantity')::int, 1),
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'total_price')::numeric, 0),
      p_notes,
      p_salesperson
    );
    v_count := v_count + 1;
    v_total := v_total + COALESCE((v_item->>'total_price')::numeric, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_platform_sales_batch(text, jsonb, text, text) TO anon, authenticated, service_role;