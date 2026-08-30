CREATE OR REPLACE FUNCTION public.create_caderneta_entries_batch(p_customer_id uuid, p_items jsonb, p_salesperson text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_count int := 0;
  v_total numeric := 0;
  v_pid_text text;
  v_pid uuid;
  v_uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_qty int;
  v_unit numeric;
  v_total_price numeric;
  v_name text;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'items array is empty';
  END IF;

  -- Verifica se cliente existe e está ativo
  IF NOT EXISTS (SELECT 1 FROM public.caderneta_customers WHERE id = p_customer_id AND COALESCE(is_active, true) = true) THEN
    RAISE EXCEPTION 'Cliente não encontrado ou inativo';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- product_id tolerante: aceita UUID válido, qualquer outra coisa vira NULL (combos, drinks sintéticos, loose cig)
    v_pid_text := NULLIF(v_item->>'product_id', '');
    IF v_pid_text IS NOT NULL AND v_pid_text ~ v_uuid_re THEN
      v_pid := v_pid_text::uuid;
    ELSE
      v_pid := NULL;
    END IF;

    v_name := COALESCE(NULLIF(trim(v_item->>'product_name'), ''), 'Item sem nome');
    v_qty := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_unit := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_total_price := COALESCE((v_item->>'total_price')::numeric, 0);

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
      v_pid,
      v_name,
      v_qty,
      v_unit,
      v_total_price,
      p_salesperson,
      NULLIF(v_item->>'notes', '')
    );
    v_count := v_count + 1;
    v_total := v_total + v_total_price;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'count', v_count,
    'total', v_total
  );
END;
$function$;