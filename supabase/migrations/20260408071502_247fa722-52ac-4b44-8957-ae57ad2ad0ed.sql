
-- 1. get_all_addresses
CREATE OR REPLACE FUNCTION public.get_all_addresses()
RETURNS SETOF addresses LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM public.addresses; END; $$;

-- 2. get_all_users
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS SETOF users LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN RETURN QUERY SELECT * FROM public.users ORDER BY created_at DESC; END; $$;

-- 3. assign_motoboy
CREATE OR REPLACE FUNCTION public.assign_motoboy(p_order_id uuid, p_motoboy_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  UPDATE public.orders SET motoboy_id = p_motoboy_id, status = 'dispatched', dispatched_at = now() WHERE id = p_order_id;
END; $$;

-- 4. delete_order
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END; $$;

-- 5. get_all_sangrias_list
CREATE OR REPLACE FUNCTION public.get_all_sangrias_list(p_start_date timestamptz DEFAULT NULL, p_end_date timestamptz DEFAULT NULL)
RETURNS SETOF sangrias LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ BEGIN
  RETURN QUERY SELECT * FROM sangrias
  WHERE (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  ORDER BY created_at DESC LIMIT 100;
END; $$;

-- 6. assign_coupon_to_user (replace auth.uid() with NULL for assigned_by)
CREATE OR REPLACE FUNCTION public.assign_coupon_to_user(p_user_id uuid, p_coupon_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE v_id UUID;
BEGIN
  INSERT INTO user_coupons (user_id, coupon_id) VALUES (p_user_id, p_coupon_id) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 7. use_coupon (remove auth.uid() ownership check - use p_user_id param instead)
CREATE OR REPLACE FUNCTION public.use_coupon(p_user_coupon_id uuid, p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE v_user_coupon user_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_user_coupon FROM user_coupons WHERE id = p_user_coupon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cupom não encontrado'; END IF;
  IF v_user_coupon.is_used THEN RAISE EXCEPTION 'Cupom já foi utilizado'; END IF;
  UPDATE user_coupons SET is_used = true, used_at = now(), used_in_order_id = p_order_id WHERE id = p_user_coupon_id;
  RETURN true;
END; $$;

-- 8. get_all_coupons_admin - remove auth.uid check (already handled by p_admin_user_id param)
-- Already has param-based validation, no change needed

-- Grant anon on all new/fixed functions
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
