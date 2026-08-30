
-- 1. create_motoboy: drop old version without p_slot_number
DROP FUNCTION IF EXISTS public.create_motoboy(text, text, boolean, text);

-- 2. get_all_coupons_admin: drop old version without params
DROP FUNCTION IF EXISTS public.get_all_coupons_admin();

-- 3. create_custom_coupon: drop old version (p_code first)
DROP FUNCTION IF EXISTS public.create_custom_coupon(text, text, numeric, text, uuid, uuid, uuid, integer, numeric);

-- 4. create_delivery_order: drop old version without p_delivery_distance
DROP FUNCTION IF EXISTS public.create_delivery_order(uuid, uuid, numeric, numeric, numeric, numeric, payment_method, numeric, text);

-- 5. register_customer: drop old version (city/state before complement, numeric lat/lng)
DROP FUNCTION IF EXISTS public.register_customer(text, text, text, text, text, text, text, text, text, text, text, numeric, numeric);

-- 6. create_cash_closure: drop old version without p_session_id
DROP FUNCTION IF EXISTS public.create_cash_closure(timestamp with time zone, timestamp with time zone, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, text, numeric, numeric, numeric, numeric, integer, integer);
