
-- Fix remaining RPCs that still use auth.uid()
CREATE OR REPLACE FUNCTION public.get_all_orders()
RETURNS SETOF orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM public.orders ORDER BY created_at DESC; END; $$;

CREATE OR REPLACE FUNCTION public.get_all_order_items(p_order_ids uuid[])
RETURNS SETOF order_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM public.order_items WHERE order_id = ANY(p_order_ids); END; $$;

CREATE OR REPLACE FUNCTION public.get_all_motoboys()
RETURNS SETOF motoboys
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM motoboys ORDER BY name ASC; END; $$;

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid, p_status order_status,
  p_accepted_at timestamptz DEFAULT NULL, p_preparing_at timestamptz DEFAULT NULL,
  p_ready_at timestamptz DEFAULT NULL, p_dispatched_at timestamptz DEFAULT NULL,
  p_arrived_at timestamptz DEFAULT NULL, p_delivered_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  UPDATE public.orders SET 
    status = p_status,
    accepted_at = COALESCE(p_accepted_at, accepted_at),
    preparing_at = COALESCE(p_preparing_at, preparing_at),
    ready_at = COALESCE(p_ready_at, ready_at),
    dispatched_at = COALESCE(p_dispatched_at, dispatched_at),
    arrived_at = COALESCE(p_arrived_at, arrived_at),
    delivered_at = COALESCE(p_delivered_at, delivered_at)
  WHERE id = p_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_all_users_with_role()
RETURNS TABLE(id uuid, name text, whatsapp text, password text, is_blocked boolean, requires_password_change boolean, created_at timestamptz, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  RETURN QUERY SELECT u.id, u.name, u.whatsapp, u.password, u.is_blocked, u.requires_password_change, u.created_at,
    COALESCE(ur.role::text, 'customer') as role
  FROM public.users u LEFT JOIN public.user_roles ur ON ur.user_id = u.id ORDER BY u.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.get_all_cash_closures()
RETURNS SETOF cash_register_closures
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM cash_register_closures ORDER BY closed_at DESC LIMIT 20; END; $$;

CREATE OR REPLACE FUNCTION public.update_delivery_fee(p_order_id uuid, p_new_fee numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE v_original_fee numeric; v_subtotal numeric; v_discount numeric;
BEGIN
  SELECT delivery_fee, subtotal, discount INTO v_original_fee, v_subtotal, v_discount FROM public.orders WHERE id = p_order_id;
  UPDATE public.orders SET delivery_fee = p_new_fee, original_delivery_fee = COALESCE(original_delivery_fee, v_original_fee),
    delivery_fee_adjusted = true, delivery_fee_adjusted_at = now(), total = v_subtotal + p_new_fee - COALESCE(v_discount, 0) WHERE id = p_order_id;
END; $$;

DROP FUNCTION IF EXISTS public.upsert_coupon_template(uuid, text, text, text, numeric, numeric, uuid, uuid, integer, boolean);

-- Mass GRANT for anon role
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', r.proname, r.args);
  END LOOP;
END $do$;
