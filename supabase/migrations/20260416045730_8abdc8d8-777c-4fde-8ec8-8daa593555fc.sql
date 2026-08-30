
-- RPC to list caderneta customers with balances, bypassing RLS
CREATE OR REPLACE FUNCTION public.list_caderneta_customers_staff(p_active_only boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'customers', COALESCE((
      SELECT json_agg(row_to_json(c) ORDER BY c.name)
      FROM (
        SELECT id, name, whatsapp, is_active, notes
        FROM caderneta_customers
        WHERE (NOT p_active_only OR is_active = true)
        ORDER BY name
      ) c
    ), '[]'::json),
    'balances', COALESCE((
      SELECT json_object_agg(customer_id, balance)
      FROM (
        SELECT
          cc.id AS customer_id,
          COALESCE(
            (SELECT SUM(ce.total_price) FROM caderneta_entries ce WHERE ce.customer_id = cc.id),
            0
          ) - COALESCE(
            (SELECT SUM(cp.amount) FROM caderneta_payments cp WHERE cp.customer_id = cc.id),
            0
          ) AS balance
        FROM caderneta_customers cc
        WHERE (NOT p_active_only OR cc.is_active = true)
      ) b
    ), '{}'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
