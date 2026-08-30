
-- Registra (ou substitui) a baixa de um pedido específico
CREATE OR REPLACE FUNCTION public.record_motoboy_order_confirmation(
  p_motoboy_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_confirmed_by text DEFAULT 'Admin',
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  DELETE FROM public.motoboy_cash_confirmations WHERE order_id = p_order_id;

  INSERT INTO public.motoboy_cash_confirmations (
    motoboy_id, order_id, amount, payment_method, confirmed_by, notes, confirmed_at
  ) VALUES (
    p_motoboy_id, p_order_id, p_amount, p_payment_method, p_confirmed_by, p_notes, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Remove a baixa de um pedido específico (reverter)
CREATE OR REPLACE FUNCTION public.delete_motoboy_order_confirmation(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.motoboy_cash_confirmations WHERE order_id = p_order_id;
END;
$function$;

-- Registra a conferência geral de um motoboy (order_id nulo)
CREATE OR REPLACE FUNCTION public.record_motoboy_general_confirmation(
  p_motoboy_id uuid,
  p_amount numeric,
  p_confirmed_by text DEFAULT 'Admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.motoboy_cash_confirmations (
    motoboy_id, amount, confirmed_by, confirmed_at
  ) VALUES (
    p_motoboy_id, p_amount, p_confirmed_by, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Remove a conferência geral de um motoboy dentro do intervalo
CREATE OR REPLACE FUNCTION public.delete_motoboy_general_confirmation(
  p_motoboy_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.motoboy_cash_confirmations
  WHERE order_id IS NULL
    AND motoboy_id = p_motoboy_id
    AND confirmed_at >= p_from
    AND confirmed_at <= p_to;
END;
$function$;

-- Lista confirmações para o painel (por intervalo e/ou por ids de pedido)
CREATE OR REPLACE FUNCTION public.list_motoboy_cash_confirmations(
  p_from timestamptz,
  p_to timestamptz,
  p_order_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  motoboy_id uuid,
  order_id uuid,
  confirmed_at timestamptz,
  confirmed_by text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT motoboy_id, order_id, confirmed_at, confirmed_by
  FROM public.motoboy_cash_confirmations
  WHERE (confirmed_at >= p_from AND confirmed_at <= p_to)
     OR (p_order_ids IS NOT NULL AND order_id = ANY(p_order_ids));
$function$;

GRANT EXECUTE ON FUNCTION public.record_motoboy_order_confirmation(uuid, uuid, numeric, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_motoboy_order_confirmation(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_motoboy_general_confirmation(uuid, numeric, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_motoboy_general_confirmation(uuid, timestamptz, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_motoboy_cash_confirmations(timestamptz, timestamptz, uuid[]) TO anon, authenticated, service_role;
