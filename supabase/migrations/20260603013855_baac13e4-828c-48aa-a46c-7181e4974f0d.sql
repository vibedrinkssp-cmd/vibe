CREATE OR REPLACE FUNCTION public.get_order_payment_proof(p_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT image_url
  FROM public.payment_confirmations
  WHERE order_id = p_order_id
    AND image_url IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_order_payment_proof(uuid) TO anon, authenticated, service_role;