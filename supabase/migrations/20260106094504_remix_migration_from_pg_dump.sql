CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'kitchen',
    'pdv',
    'motoboy',
    'customer'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'dispatched',
    'arrived',
    'delivered',
    'cancelled'
);


--
-- Name: order_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_type AS ENUM (
    'delivery',
    'pickup',
    'local',
    'counter'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'pix',
    'cash',
    'card_pos',
    'card_credit',
    'card_debit'
);


--
-- Name: add_cash_supply(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_cash_supply(p_session_id uuid, p_amount numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE cash_register_sessions
  SET cash_supplies = COALESCE(cash_supplies, 0) + p_amount
  WHERE id = p_session_id AND status = 'open';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada ou fechada';
  END IF;
END;
$$;


--
-- Name: assign_motoboy(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_motoboy(p_order_id uuid, p_motoboy_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.orders
  SET 
    motoboy_id = p_motoboy_id,
    status = 'dispatched',
    dispatched_at = now()
  WHERE id = p_order_id;
END;
$$;


--
-- Name: calculate_real_profit(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_real_profit(p_start timestamp with time zone, p_end timestamp with time zone) RETURNS TABLE(total_revenue numeric, total_product_cost numeric, gross_profit numeric, total_delivery_fees numeric, counter_orders_count bigint, delivery_orders_count bigint, total_orders_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH order_stats AS (
    SELECT 
      o.id,
      o.order_type,
      o.delivery_fee,
      o.subtotal
    FROM orders o
    WHERE o.created_at >= p_start 
    AND o.created_at < p_end
    AND o.status NOT IN ('pending', 'cancelled')
  ),
  item_costs AS (
    SELECT 
      oi.order_id,
      SUM(oi.total_price) as item_revenue,
      SUM(COALESCE(p.cost_price, 0) * oi.quantity) as item_cost
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id IN (SELECT id FROM order_stats)
    GROUP BY oi.order_id
  )
  SELECT 
    COALESCE(SUM(ic.item_revenue), 0)::NUMERIC as total_revenue,
    COALESCE(SUM(ic.item_cost), 0)::NUMERIC as total_product_cost,
    (COALESCE(SUM(ic.item_revenue), 0) - COALESCE(SUM(ic.item_cost), 0))::NUMERIC as gross_profit,
    COALESCE(SUM(os.delivery_fee), 0)::NUMERIC as total_delivery_fees,
    COUNT(*) FILTER (WHERE os.order_type = 'counter')::BIGINT as counter_orders_count,
    COUNT(*) FILTER (WHERE os.order_type = 'delivery')::BIGINT as delivery_orders_count,
    COUNT(*)::BIGINT as total_orders_count
  FROM order_stats os
  LEFT JOIN item_costs ic ON ic.order_id = os.id;
END;
$$;


--
-- Name: close_cash_register(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_cash_register(p_session_id uuid, p_closed_by text DEFAULT 'Sistema'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE cash_register_sessions
  SET 
    status = 'closed',
    closed_at = NOW(),
    closed_by = p_closed_by
  WHERE id = p_session_id AND status = 'open';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada ou já fechada';
  END IF;
END;
$$;


--
-- Name: create_cash_closure(timestamp with time zone, timestamp with time zone, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, integer, text, text, numeric, numeric, numeric, numeric, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_cash_closure(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_shift_type text, p_opening_balance numeric, p_expected_cash numeric, p_actual_cash numeric, p_cash_difference numeric, p_total_sales numeric, p_total_pix numeric, p_total_card_credit numeric, p_total_card_debit numeric, p_total_cash numeric, p_gross_profit numeric, p_net_profit numeric, p_total_sangrias numeric, p_total_orders integer, p_notes text DEFAULT NULL::text, p_closed_by text DEFAULT NULL::text, p_total_delivery_fees numeric DEFAULT 0, p_total_product_cost numeric DEFAULT 0, p_real_gross_profit numeric DEFAULT 0, p_cash_supplies numeric DEFAULT 0, p_counter_orders_count integer DEFAULT 0, p_delivery_orders_count integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_closure_id UUID;
BEGIN
  INSERT INTO cash_register_closures (
    period_start,
    period_end,
    shift_type,
    opening_balance,
    expected_cash,
    actual_cash,
    cash_difference,
    total_sales,
    total_pix,
    total_card_credit,
    total_card_debit,
    total_cash,
    gross_profit,
    net_profit,
    total_sangrias,
    total_orders,
    notes,
    closed_by,
    closed_at,
    total_delivery_fees,
    total_product_cost,
    real_gross_profit,
    cash_supplies,
    counter_orders_count,
    delivery_orders_count
  ) VALUES (
    p_period_start,
    p_period_end,
    p_shift_type,
    p_opening_balance,
    p_expected_cash,
    p_actual_cash,
    p_cash_difference,
    p_total_sales,
    p_total_pix,
    p_total_card_credit,
    p_total_card_debit,
    p_total_cash,
    p_gross_profit,
    p_net_profit,
    p_total_sangrias,
    p_total_orders,
    p_notes,
    p_closed_by,
    NOW(),
    p_total_delivery_fees,
    p_total_product_cost,
    p_real_gross_profit,
    p_cash_supplies,
    p_counter_orders_count,
    p_delivery_orders_count
  )
  RETURNING id INTO v_closure_id;
  
  RETURN v_closure_id;
END;
$$;


--
-- Name: create_counter_order(uuid, numeric, numeric, numeric, numeric, public.payment_method, numeric, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_counter_order(p_user_id uuid DEFAULT NULL::uuid, p_subtotal numeric DEFAULT 0, p_delivery_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_total numeric DEFAULT 0, p_payment_method public.payment_method DEFAULT 'cash'::public.payment_method, p_change_for numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text, p_customer_name text DEFAULT 'Balconista'::text, p_salesperson text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  new_order_id uuid;
  v_calculated_total numeric;
BEGIN
  -- Validar valores numéricos positivos
  IF p_subtotal < 0 THEN
    RAISE EXCEPTION 'Subtotal não pode ser negativo';
  END IF;
  
  IF p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'Taxa de entrega não pode ser negativa';
  END IF;
  
  IF p_discount < 0 OR p_discount > p_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;
  
  IF p_total < 0 THEN
    RAISE EXCEPTION 'Total não pode ser negativo';
  END IF;
  
  -- Validar cálculo do total (tolerância de R$0.10)
  v_calculated_total := p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0);
  IF ABS(v_calculated_total - p_total) > 0.10 THEN
    RAISE EXCEPTION 'Cálculo do total inconsistente';
  END IF;
  
  -- Validar troco para pagamento em dinheiro
  IF p_payment_method = 'cash' AND p_change_for IS NOT NULL THEN
    IF p_change_for < p_total THEN
      RAISE EXCEPTION 'Valor para troco menor que o total';
    END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, order_type, status, subtotal, delivery_fee, discount, total,
    payment_method, change_for, notes, customer_name, salesperson
  )
  VALUES (
    p_user_id, 'counter', 'accepted', p_subtotal, p_delivery_fee, p_discount, p_total,
    p_payment_method, p_change_for, p_notes, p_customer_name, p_salesperson
  )
  RETURNING id INTO new_order_id;
  
  RETURN new_order_id;
END;
$_$;


--
-- Name: create_delivery_order(uuid, uuid, numeric, numeric, numeric, numeric, public.payment_method, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_delivery_order(p_user_id uuid, p_address_id uuid, p_subtotal numeric DEFAULT 0, p_delivery_fee numeric DEFAULT 0, p_discount numeric DEFAULT 0, p_total numeric DEFAULT 0, p_payment_method public.payment_method DEFAULT 'pix'::public.payment_method, p_change_for numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_order_id uuid;
  v_user_blocked boolean;
  v_address_user_id uuid;
  v_calculated_total numeric;
BEGIN
  -- Verificar se usuário existe e não está bloqueado
  SELECT is_blocked INTO v_user_blocked FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  IF v_user_blocked = true THEN
    RAISE EXCEPTION 'Usuário bloqueado';
  END IF;
  
  -- Verificar se endereço existe e pertence ao usuário
  SELECT user_id INTO v_address_user_id FROM addresses WHERE id = p_address_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endereço não encontrado';
  END IF;
  IF v_address_user_id != p_user_id THEN
    RAISE EXCEPTION 'Endereço não pertence ao usuário';
  END IF;
  
  -- Validar valores numéricos
  IF p_subtotal < 0 OR p_delivery_fee < 0 OR p_total < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;
  
  IF p_discount < 0 OR p_discount > p_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;
  
  -- Validar cálculo do total
  v_calculated_total := p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0);
  IF ABS(v_calculated_total - p_total) > 0.10 THEN
    RAISE EXCEPTION 'Cálculo do total inconsistente';
  END IF;
  
  -- Validar troco
  IF p_payment_method = 'cash' AND p_change_for IS NOT NULL THEN
    IF p_change_for < p_total THEN
      RAISE EXCEPTION 'Valor para troco menor que o total';
    END IF;
  END IF;

  INSERT INTO public.orders (
    user_id, address_id, order_type, status, subtotal, delivery_fee, 
    delivery_distance, discount, total, payment_method, change_for, notes
  )
  VALUES (
    p_user_id, p_address_id, 'delivery', 'pending', p_subtotal, p_delivery_fee,
    0, p_discount, p_total, p_payment_method, p_change_for, p_notes
  )
  RETURNING id INTO new_order_id;
  
  RETURN new_order_id;
END;
$$;


--
-- Name: create_motoboy(text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_motoboy(p_name text, p_whatsapp text, p_is_active boolean DEFAULT true, p_password text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_motoboy_id UUID;
BEGIN
  INSERT INTO motoboys (name, whatsapp, is_active, password)
  VALUES (p_name, p_whatsapp, p_is_active, p_password)
  RETURNING id INTO v_motoboy_id;
  
  RETURN v_motoboy_id;
END;
$$;


--
-- Name: create_motoboy(text, text, boolean, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_motoboy(p_name text, p_whatsapp text, p_is_active boolean DEFAULT true, p_password text DEFAULT NULL::text, p_slot_number integer DEFAULT NULL::integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO motoboys (name, whatsapp, is_active, password, slot_number)
  VALUES (p_name, p_whatsapp, COALESCE(p_is_active, true), p_password, p_slot_number)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;


--
-- Name: create_order_items(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_items(p_order_id uuid, p_items text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  items_jsonb jsonb;
  current_item jsonb;
  v_order_status order_status;
  v_qty integer;
  v_unit_price numeric;
  v_total_price numeric;
  v_product_name text;
BEGIN
  -- Verificar se o pedido existe e pode ser modificado
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  
  IF v_order_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Não é possível modificar pedido finalizado';
  END IF;
  
  -- Parse JSON
  items_jsonb := p_items::jsonb;
  
  -- Validar cada item antes de inserir
  FOR current_item IN SELECT * FROM jsonb_array_elements(items_jsonb)
  LOOP
    v_qty := (current_item->>'quantity')::integer;
    v_unit_price := (current_item->>'unit_price')::numeric;
    v_total_price := (current_item->>'total_price')::numeric;
    v_product_name := current_item->>'product_name';
    
    -- Validações
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade deve ser positiva';
    END IF;
    
    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Preço unitário inválido';
    END IF;
    
    IF v_total_price IS NULL OR v_total_price < 0 THEN
      RAISE EXCEPTION 'Preço total inválido';
    END IF;
    
    IF v_product_name IS NULL OR LENGTH(v_product_name) > 200 THEN
      RAISE EXCEPTION 'Nome do produto inválido';
    END IF;
  END LOOP;
  
  -- Inserir itens validados
  INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT 
    p_order_id,
    (json_item->>'product_id')::uuid,
    json_item->>'product_name',
    (json_item->>'quantity')::integer,
    (json_item->>'unit_price')::numeric,
    (json_item->>'total_price')::numeric
  FROM jsonb_array_elements(items_jsonb) AS json_item;
END;
$$;


--
-- Name: delete_motoboy(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_motoboy(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM motoboys WHERE id = p_id;
END;
$$;


--
-- Name: delete_order(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_order(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;


SET default_table_access_method = heap;

--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    street text NOT NULL,
    number text NOT NULL,
    complement text,
    neighborhood text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    zip_code text,
    notes text,
    is_default boolean DEFAULT false,
    latitude numeric,
    longitude numeric
);

ALTER TABLE ONLY public.addresses REPLICA IDENTITY FULL;


--
-- Name: get_all_addresses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_addresses() RETURNS SETOF public.addresses
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.addresses;
END;
$$;


--
-- Name: cash_register_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_register_closures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    closed_at timestamp with time zone DEFAULT now(),
    total_cash numeric DEFAULT 0,
    total_card_credit numeric DEFAULT 0,
    total_card_debit numeric DEFAULT 0,
    total_pix numeric DEFAULT 0,
    total_sales numeric DEFAULT 0,
    notes text,
    closed_by text,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    shift_type text,
    opening_balance numeric DEFAULT 0,
    expected_cash numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    cash_difference numeric DEFAULT 0,
    gross_profit numeric DEFAULT 0,
    net_profit numeric DEFAULT 0,
    total_sangrias numeric DEFAULT 0,
    total_orders integer DEFAULT 0,
    total_delivery_fees numeric DEFAULT 0,
    total_product_cost numeric DEFAULT 0,
    real_gross_profit numeric DEFAULT 0,
    card_fees_estimate numeric DEFAULT 0,
    cash_supplies numeric DEFAULT 0,
    counter_orders_count integer DEFAULT 0,
    delivery_orders_count integer DEFAULT 0,
    session_id uuid
);

ALTER TABLE ONLY public.cash_register_closures REPLICA IDENTITY FULL;


--
-- Name: get_all_cash_closures(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_cash_closures() RETURNS SETOF public.cash_register_closures
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM cash_register_closures
  ORDER BY closed_at DESC
  LIMIT 20;
END;
$$;


--
-- Name: motoboys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motoboys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    whatsapp text NOT NULL,
    photo_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    current_latitude numeric,
    current_longitude numeric,
    location_updated_at timestamp with time zone,
    password text,
    slot_number integer
);

ALTER TABLE ONLY public.motoboys REPLICA IDENTITY FULL;


--
-- Name: get_all_motoboys(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_motoboys() RETURNS SETOF public.motoboys
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM motoboys
  ORDER BY name ASC;
END;
$$;


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    total_price numeric DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.order_items REPLICA IDENTITY FULL;


--
-- Name: get_all_order_items(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_order_items(p_order_ids uuid[]) RETURNS SETOF public.order_items
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.order_items
  WHERE order_id = ANY(p_order_ids);
END;
$$;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    address_id uuid,
    order_type public.order_type DEFAULT 'counter'::public.order_type NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    delivery_fee numeric DEFAULT 0,
    delivery_distance numeric,
    discount numeric DEFAULT 0,
    total numeric DEFAULT 0 NOT NULL,
    payment_method public.payment_method DEFAULT 'cash'::public.payment_method NOT NULL,
    change_for numeric,
    notes text,
    customer_name text,
    salesperson text,
    motoboy_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    preparing_at timestamp with time zone,
    ready_at timestamp with time zone,
    dispatched_at timestamp with time zone,
    arrived_at timestamp with time zone,
    delivered_at timestamp with time zone,
    original_delivery_fee numeric,
    delivery_fee_adjusted boolean DEFAULT false,
    delivery_fee_adjusted_at timestamp with time zone
);

ALTER TABLE ONLY public.orders REPLICA IDENTITY FULL;


--
-- Name: get_all_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_orders() RETURNS SETOF public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.orders
  ORDER BY created_at DESC;
END;
$$;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    whatsapp text NOT NULL,
    password text,
    is_blocked boolean DEFAULT false,
    requires_password_change boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.users REPLICA IDENTITY FULL;


--
-- Name: get_all_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_users() RETURNS SETOF public.users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.users
  ORDER BY created_at DESC;
END;
$$;


--
-- Name: get_all_users_with_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_users_with_role() RETURNS TABLE(id uuid, name text, whatsapp text, password text, is_blocked boolean, requires_password_change boolean, created_at timestamp with time zone, role text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.name,
    u.whatsapp,
    u.password,
    u.is_blocked,
    u.requires_password_change,
    u.created_at,
    COALESCE(ur.role::text, 'customer') as role
  FROM public.users u
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$;


--
-- Name: get_current_cash_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_cash_balance() RETURNS TABLE(session_id uuid, opening_balance numeric, cash_sales numeric, cash_withdrawals numeric, cash_supplies numeric, current_balance numeric, session_status text, opened_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_session cash_register_sessions%ROWTYPE;
  v_cash_sales NUMERIC;
  v_withdrawals NUMERIC;
BEGIN
  -- Get current open session
  SELECT * INTO v_session 
  FROM cash_register_sessions 
  WHERE status = 'open' 
  ORDER BY opened_at DESC 
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- No open session
    RETURN QUERY SELECT 
      NULL::UUID,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      0::NUMERIC,
      'closed'::TEXT,
      NULL::TIMESTAMPTZ;
    RETURN;
  END IF;
  
  -- Calculate cash sales since session opened
  SELECT COALESCE(SUM(total), 0) INTO v_cash_sales
  FROM orders
  WHERE payment_method = 'cash'
  AND status NOT IN ('pending', 'cancelled')
  AND created_at >= v_session.opened_at;
  
  -- Calculate withdrawals (sangrias) since session opened
  SELECT COALESCE(SUM(amount), 0) INTO v_withdrawals
  FROM sangrias
  WHERE created_at >= v_session.opened_at;
  
  RETURN QUERY SELECT 
    v_session.id,
    v_session.opening_balance,
    v_cash_sales,
    v_withdrawals,
    COALESCE(v_session.cash_supplies, 0),
    (v_session.opening_balance + v_cash_sales - v_withdrawals + COALESCE(v_session.cash_supplies, 0))::NUMERIC,
    v_session.status,
    v_session.opened_at;
END;
$$;


--
-- Name: get_customers_for_orders(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customers_for_orders() RETURNS TABLE(id uuid, name text, whatsapp text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Retorna apenas dados básicos de clientes (sem senhas, sem is_blocked, etc)
  RETURN QUERY
  SELECT u.id, u.name, u.whatsapp
  FROM public.users u
  INNER JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.role = 'customer'
  ORDER BY u.name ASC;
END;
$$;


--
-- Name: get_user_orders(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_orders(p_user_id uuid) RETURNS SETOF public.orders
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.orders
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;
END;
$$;


--
-- Name: get_user_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role(_user_id uuid) RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
-- Name: open_cash_register(numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_cash_register(p_opening_balance numeric DEFAULT 0, p_opened_by text DEFAULT 'Sistema'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_existing_session_id UUID;
  v_new_session_id UUID;
BEGIN
  -- Check if there's already an open session
  SELECT id INTO v_existing_session_id 
  FROM cash_register_sessions 
  WHERE status = 'open' 
  LIMIT 1;
  
  IF v_existing_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta';
  END IF;
  
  -- Create new session
  INSERT INTO cash_register_sessions (
    opening_balance,
    current_balance,
    opened_by,
    status,
    cash_supplies
  ) VALUES (
    p_opening_balance,
    p_opening_balance,
    p_opened_by,
    'open',
    0
  )
  RETURNING id INTO v_new_session_id;
  
  RETURN v_new_session_id;
END;
$$;


--
-- Name: register_customer(text, text, text, text, text, text, text, text, text, text, text, double precision, double precision); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_customer(p_name text, p_whatsapp text, p_password text, p_street text, p_number text, p_neighborhood text, p_complement text DEFAULT NULL::text, p_city text DEFAULT 'São Paulo'::text, p_state text DEFAULT 'SP'::text, p_zip_code text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    new_user_id UUID;
    new_address_id UUID;
    existing_user RECORD;
    final_password TEXT;
    salt TEXT;
BEGIN
    -- Check if user already exists
    SELECT * INTO existing_user FROM users WHERE whatsapp = p_whatsapp;
    
    IF existing_user IS NOT NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuário já cadastrado com este WhatsApp'
        );
    END IF;
    
    -- Hash password if not already hashed
    IF p_password LIKE 'sha256:%' THEN
        final_password := p_password;
    ELSE
        salt := gen_random_uuid()::TEXT;
        final_password := 'sha256:' || salt || ':' || encode(digest(p_password || salt, 'sha256'), 'hex');
    END IF;
    
    -- Create user
    INSERT INTO users (name, whatsapp, password, is_blocked, requires_password_change)
    VALUES (p_name, p_whatsapp, final_password, false, false)
    RETURNING id INTO new_user_id;
    
    -- Add customer role
    INSERT INTO user_roles (user_id, role)
    VALUES (new_user_id, 'customer');
    
    -- Create address
    INSERT INTO addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
    VALUES (new_user_id, p_street, p_number, p_complement, p_neighborhood, p_city, p_state, p_zip_code, p_notes, p_latitude, p_longitude, true)
    RETURNING id INTO new_address_id;
    
    RETURN json_build_object(
        'success', true,
        'user', json_build_object(
            'id', new_user_id,
            'name', p_name,
            'whatsapp', p_whatsapp,
            'role', 'customer'
        ),
        'address', json_build_object(
            'id', new_address_id,
            'userId', new_user_id,
            'street', p_street,
            'number', p_number,
            'complement', p_complement,
            'neighborhood', p_neighborhood,
            'city', p_city,
            'state', p_state,
            'zipCode', p_zip_code,
            'notes', p_notes,
            'latitude', p_latitude,
            'longitude', p_longitude,
            'isDefault', true
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: update_delivery_fee(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_delivery_fee(p_order_id uuid, p_new_fee numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_original_fee numeric;
  v_subtotal numeric;
  v_discount numeric;
BEGIN
  SELECT delivery_fee, original_delivery_fee, subtotal, discount
  INTO v_original_fee, v_original_fee, v_subtotal, v_discount
  FROM public.orders
  WHERE id = p_order_id;
  
  UPDATE public.orders
  SET 
    delivery_fee = p_new_fee,
    original_delivery_fee = COALESCE(original_delivery_fee, v_original_fee),
    delivery_fee_adjusted = true,
    delivery_fee_adjusted_at = now(),
    total = v_subtotal + p_new_fee - COALESCE(v_discount, 0)
  WHERE id = p_order_id;
END;
$$;


--
-- Name: update_motoboy(uuid, text, text, boolean, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_motoboy(p_id uuid, p_name text DEFAULT NULL::text, p_whatsapp text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean, p_password text DEFAULT NULL::text, p_slot_number integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE motoboys
  SET
    name = COALESCE(p_name, name),
    whatsapp = COALESCE(p_whatsapp, whatsapp),
    is_active = COALESCE(p_is_active, is_active),
    password = CASE WHEN p_password IS NOT NULL AND p_password != '' THEN p_password ELSE password END,
    slot_number = COALESCE(p_slot_number, slot_number)
  WHERE id = p_id;
END;
$$;


--
-- Name: update_motoboy_location(uuid, numeric, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_motoboy_location(p_motoboy_id uuid, p_latitude numeric, p_longitude numeric, p_order_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update current location on motoboys table
  UPDATE public.motoboys
  SET 
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    location_updated_at = now()
  WHERE id = p_motoboy_id;
  
  -- Insert into location history
  INSERT INTO public.motoboy_locations (motoboy_id, order_id, latitude, longitude)
  VALUES (p_motoboy_id, p_order_id, p_latitude, p_longitude);
END;
$$;


--
-- Name: update_order_status(uuid, public.order_status, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_order_status(p_order_id uuid, p_status public.order_status, p_accepted_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_preparing_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ready_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_dispatched_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_arrived_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.orders
  SET 
    status = p_status,
    accepted_at = COALESCE(p_accepted_at, accepted_at),
    preparing_at = COALESCE(p_preparing_at, preparing_at),
    ready_at = COALESCE(p_ready_at, ready_at),
    dispatched_at = COALESCE(p_dispatched_at, dispatched_at),
    arrived_at = COALESCE(p_arrived_at, arrived_at),
    delivered_at = COALESCE(p_delivered_at, delivered_at)
  WHERE id = p_order_id;
END;
$$;


--
-- Name: verify_motoboy_login(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_motoboy_login(p_motoboy_id uuid, p_password text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_motoboy motoboys%ROWTYPE;
  v_stored_password text;
  v_salt text;
  v_hash text;
  v_computed_hash text;
BEGIN
  -- Get motoboy data
  SELECT * INTO v_motoboy FROM motoboys WHERE id = p_motoboy_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy não encontrado');
  END IF;
  
  IF NOT v_motoboy.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy inativo');
  END IF;
  
  v_stored_password := v_motoboy.password;
  
  IF v_stored_password IS NULL OR v_stored_password = '' THEN
    RETURN json_build_object('success', false, 'error', 'Senha não configurada');
  END IF;
  
  -- Check if hashed (sha256:salt:hash format)
  IF v_stored_password LIKE 'sha256:%' THEN
    v_salt := split_part(v_stored_password, ':', 2);
    v_hash := split_part(v_stored_password, ':', 3);
    v_computed_hash := encode(digest(p_password || v_salt, 'sha256'), 'hex');
    
    IF v_computed_hash = v_hash THEN
      RETURN json_build_object(
        'success', true, 
        'motoboy', json_build_object(
          'id', v_motoboy.id,
          'name', v_motoboy.name,
          'whatsapp', v_motoboy.whatsapp,
          'is_active', v_motoboy.is_active
        )
      );
    ELSE
      RETURN json_build_object('success', false, 'error', 'Senha incorreta');
    END IF;
  ELSE
    -- Plaintext comparison (legacy - will be migrated)
    IF p_password = v_stored_password THEN
      RETURN json_build_object(
        'success', true, 
        'motoboy', json_build_object(
          'id', v_motoboy.id,
          'name', v_motoboy.name,
          'whatsapp', v_motoboy.whatsapp,
          'is_active', v_motoboy.is_active
        )
      );
    ELSE
      RETURN json_build_object('success', false, 'error', 'Senha incorreta');
    END IF;
  END IF;
END;
$$;


--
-- Name: verify_staff_login(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_staff_login(p_role text, p_password text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    found_user RECORD;
BEGIN
    -- Find users with the specified role
    FOR found_user IN 
        SELECT u.* FROM users u
        INNER JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = p_role::app_role
        AND u.is_blocked = FALSE
    LOOP
        -- Verify password using secure function
        IF verify_user_password(found_user.id, p_password) THEN
            RETURN json_build_object(
                'success', true,
                'user', json_build_object(
                    'id', found_user.id,
                    'name', found_user.name,
                    'whatsapp', found_user.whatsapp,
                    'role', p_role
                )
            );
        END IF;
    END LOOP;
    
    RETURN json_build_object('success', false, 'error', 'Senha incorreta');
END;
$$;


--
-- Name: verify_user_password(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_user_password(p_user_id uuid, p_password text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
    stored_password TEXT;
    hash_parts TEXT[];
    computed_hash TEXT;
BEGIN
    SELECT password INTO stored_password FROM users WHERE id = p_user_id;
    
    IF stored_password IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- SHA-256 verification
    IF stored_password LIKE 'sha256:%' THEN
        hash_parts := string_to_array(stored_password, ':');
        IF array_length(hash_parts, 1) = 3 THEN
            computed_hash := encode(digest(p_password || hash_parts[2], 'sha256'), 'hex');
            RETURN computed_hash = hash_parts[3];
        END IF;
    -- Bcrypt verification using pgcrypto
    ELSIF stored_password LIKE '$2%' THEN
        RETURN stored_password = crypt(p_password, stored_password);
    -- Plain text fallback (legacy - should migrate)
    ELSE
        RETURN stored_password = p_password;
    END IF;
    
    RETURN FALSE;
END;
$_$;


--
-- Name: banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    image_url text NOT NULL,
    link_url text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.banners REPLICA IDENTITY FULL;


--
-- Name: cash_register_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_register_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_balance numeric DEFAULT 0 NOT NULL,
    current_balance numeric DEFAULT 0 NOT NULL,
    cash_supplies numeric DEFAULT 0,
    status text DEFAULT 'open'::text NOT NULL,
    opened_by text,
    closed_by text,
    notes text,
    closure_id uuid,
    CONSTRAINT cash_register_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

ALTER TABLE ONLY public.cash_register_sessions REPLICA IDENTITY FULL;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon_url text,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    is_special boolean DEFAULT false
);

ALTER TABLE ONLY public.categories REPLICA IDENTITY FULL;


--
-- Name: motoboy_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.motoboy_locations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    motoboy_id uuid NOT NULL,
    order_id uuid,
    latitude numeric NOT NULL,
    longitude numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.motoboy_locations REPLICA IDENTITY FULL;


--
-- Name: motoboys_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.motoboys_public AS
 SELECT id,
    name,
    is_active,
    slot_number
   FROM public.motoboys
  ORDER BY slot_number;


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid,
    name text NOT NULL,
    description text,
    image_url text,
    cost_price numeric DEFAULT 0,
    profit_margin numeric DEFAULT 0,
    sale_price numeric NOT NULL,
    stock integer DEFAULT 0,
    is_active boolean DEFAULT true,
    product_type text,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    combo_eligible boolean DEFAULT false,
    is_prepared boolean DEFAULT false
);

ALTER TABLE ONLY public.products REPLICA IDENTITY FULL;


--
-- Name: sangria_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sangria_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sangria_id uuid NOT NULL,
    product_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    notes text
);


--
-- Name: sangrias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sangrias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    closure_id uuid,
    amount numeric DEFAULT 0 NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    type text DEFAULT 'outros'::text NOT NULL,
    description text,
    responsible text DEFAULT 'Sistema'::text NOT NULL
);

ALTER TABLE ONLY public.sangrias REPLICA IDENTITY FULL;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_address text,
    store_lat numeric,
    store_lng numeric,
    delivery_rate_per_km numeric DEFAULT 1,
    min_delivery_fee numeric DEFAULT 4,
    max_delivery_distance numeric DEFAULT 15,
    pix_key text,
    opening_hours jsonb,
    is_open boolean DEFAULT true
);

ALTER TABLE ONLY public.settings REPLICA IDENTITY FULL;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: visitor_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id text NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    last_activity_at timestamp with time zone DEFAULT now(),
    page_views integer DEFAULT 1,
    current_page text,
    user_agent text,
    is_active boolean DEFAULT true
);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: banners banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.banners
    ADD CONSTRAINT banners_pkey PRIMARY KEY (id);


--
-- Name: cash_register_closures cash_register_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_closures
    ADD CONSTRAINT cash_register_closures_pkey PRIMARY KEY (id);


--
-- Name: cash_register_sessions cash_register_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: motoboy_locations motoboy_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_locations
    ADD CONSTRAINT motoboy_locations_pkey PRIMARY KEY (id);


--
-- Name: motoboys motoboys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboys
    ADD CONSTRAINT motoboys_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: sangria_items sangria_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangria_items
    ADD CONSTRAINT sangria_items_pkey PRIMARY KEY (id);


--
-- Name: sangrias sangrias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangrias
    ADD CONSTRAINT sangrias_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_whatsapp_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_whatsapp_key UNIQUE (whatsapp);


--
-- Name: visitor_sessions visitor_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_sessions
    ADD CONSTRAINT visitor_sessions_pkey PRIMARY KEY (id);


--
-- Name: visitor_sessions visitor_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_sessions
    ADD CONSTRAINT visitor_sessions_session_id_key UNIQUE (session_id);


--
-- Name: idx_motoboy_locations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motoboy_locations_created_at ON public.motoboy_locations USING btree (created_at DESC);


--
-- Name: idx_motoboy_locations_motoboy_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motoboy_locations_motoboy_id ON public.motoboy_locations USING btree (motoboy_id);


--
-- Name: idx_motoboy_locations_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_motoboy_locations_order_id ON public.motoboy_locations USING btree (order_id);


--
-- Name: idx_motoboys_slot_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_motoboys_slot_number ON public.motoboys USING btree (slot_number) WHERE (slot_number IS NOT NULL);


--
-- Name: idx_sangrias_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sangrias_type ON public.sangrias USING btree (type);


--
-- Name: idx_visitor_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_sessions_active ON public.visitor_sessions USING btree (is_active, last_activity_at);


--
-- Name: idx_visitor_sessions_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_visitor_sessions_started ON public.visitor_sessions USING btree (started_at);


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cash_register_closures cash_register_closures_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_closures
    ADD CONSTRAINT cash_register_closures_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_register_sessions(id);


--
-- Name: cash_register_sessions cash_register_sessions_closure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES public.cash_register_closures(id);


--
-- Name: motoboy_locations motoboy_locations_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_locations
    ADD CONSTRAINT motoboy_locations_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE CASCADE;


--
-- Name: motoboy_locations motoboy_locations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.motoboy_locations
    ADD CONSTRAINT motoboy_locations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_address_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_address_id_fkey FOREIGN KEY (address_id) REFERENCES public.addresses(id) ON DELETE SET NULL;


--
-- Name: orders orders_motoboy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_motoboy_id_fkey FOREIGN KEY (motoboy_id) REFERENCES public.motoboys(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: sangria_items sangria_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangria_items
    ADD CONSTRAINT sangria_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: sangria_items sangria_items_sangria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangria_items
    ADD CONSTRAINT sangria_items_sangria_id_fkey FOREIGN KEY (sangria_id) REFERENCES public.sangrias(id) ON DELETE CASCADE;


--
-- Name: sangrias sangrias_closure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangrias
    ADD CONSTRAINT sangrias_closure_id_fkey FOREIGN KEY (closure_id) REFERENCES public.cash_register_closures(id) ON DELETE CASCADE;


--
-- Name: sangrias sangrias_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sangrias
    ADD CONSTRAINT sangrias_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: addresses Address visibility; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Address visibility" ON public.addresses FOR SELECT USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Admin gerencia roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin gerencia roles" ON public.user_roles TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories Admin pode atualizar categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode atualizar categories" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories Admin pode deletar categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode deletar categories" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: order_items Admin pode deletar order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode deletar order_items" ON public.order_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: orders Admin pode deletar pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode deletar pedidos" ON public.orders FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: products Admin pode deletar products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode deletar products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: users Admin pode deletar users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode deletar users" ON public.users FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: banners Admin pode gerenciar banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode gerenciar banners" ON public.banners TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cash_register_closures Admin pode gerenciar fechamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode gerenciar fechamentos" ON public.cash_register_closures USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: motoboys Admin pode gerenciar motoboys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode gerenciar motoboys" ON public.motoboys TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cash_register_sessions Admin pode gerenciar sessões de caixa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode gerenciar sessões de caixa" ON public.cash_register_sessions USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: categories Admin pode inserir categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode inserir categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cash_register_closures Admin pode ver fechamentos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode ver fechamentos" ON public.cash_register_closures FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: cash_register_sessions Admin pode ver sessões de caixa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin pode ver sessões de caixa" ON public.cash_register_sessions FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: products Admin/PDV pode atualizar products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/PDV pode atualizar products" ON public.products FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: products Admin/PDV pode inserir products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin/PDV pode inserir products" ON public.products FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: visitor_sessions Allow insert visitor sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert visitor sessions" ON public.visitor_sessions FOR INSERT WITH CHECK (true);


--
-- Name: visitor_sessions Allow select own visitor session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow select own visitor session" ON public.visitor_sessions FOR SELECT USING (true);


--
-- Name: visitor_sessions Allow update own visitor session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow update own visitor session" ON public.visitor_sessions FOR UPDATE USING (true) WITH CHECK ((session_id = session_id));


--
-- Name: visitor_sessions Anyone can insert visitor sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can insert visitor sessions" ON public.visitor_sessions FOR INSERT WITH CHECK (true);


--
-- Name: visitor_sessions Anyone can update their own session; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can update their own session" ON public.visitor_sessions FOR UPDATE USING (true);


--
-- Name: settings Apenas admin pode atualizar settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apenas admin pode atualizar settings" ON public.settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: settings Apenas admin pode inserir settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Apenas admin pode inserir settings" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: banners Banners são públicos para leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Banners são públicos para leitura" ON public.banners FOR SELECT TO authenticated, anon USING (true);


--
-- Name: categories Categories são públicas para leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Categories são públicas para leitura" ON public.categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: motoboy_locations Clientes podem ver localização do motoboy do seu pedido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clientes podem ver localização do motoboy do seu pedido" ON public.motoboy_locations FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = motoboy_locations.order_id) AND (o.user_id = auth.uid())))));


--
-- Name: order_items Inserção de order_items apenas via RPC; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inserção de order_items apenas via RPC" ON public.order_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND (o.status <> ALL (ARRAY['delivered'::public.order_status, 'cancelled'::public.order_status]))))));


--
-- Name: motoboy_locations Motoboys podem inserir localizações; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Motoboys podem inserir localizações" ON public.motoboy_locations FOR INSERT WITH CHECK ((public.has_role(auth.uid(), 'motoboy'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: order_items Order items visible to order owner or staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Order items visible to order owner or staff" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND ((o.user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR public.has_role(auth.uid(), 'kitchen'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role))))));


--
-- Name: orders Permitir criação de pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir criação de pedidos" ON public.orders FOR INSERT WITH CHECK (((order_type = 'counter'::public.order_type) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR ((auth.uid() IS NOT NULL) AND (user_id = auth.uid()))));


--
-- Name: products Products são públicos para leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Products são públicos para leitura" ON public.products FOR SELECT TO authenticated, anon USING (true);


--
-- Name: settings Settings são públicas para leitura; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Settings são públicas para leitura" ON public.settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: visitor_sessions Staff can delete visitor sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete visitor sessions" ON public.visitor_sessions FOR DELETE USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: visitor_sessions Staff can view all visitor sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view all visitor sessions" ON public.visitor_sessions FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: motoboys Staff can view motoboys; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view motoboys" ON public.motoboys FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: order_items Staff pode atualizar order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode atualizar order_items" ON public.order_items FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: orders Staff pode atualizar pedidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode atualizar pedidos" ON public.orders FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR public.has_role(auth.uid(), 'kitchen'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: sangria_items Staff pode gerenciar sangria_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode gerenciar sangria_items" ON public.sangria_items TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: sangrias Staff pode gerenciar sangrias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode gerenciar sangrias" ON public.sangrias TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: order_items Staff pode inserir order_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode inserir order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: motoboy_locations Staff pode ver localizações; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode ver localizações" ON public.motoboy_locations FOR SELECT USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: sangria_items Staff pode ver sangria_items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode ver sangria_items" ON public.sangria_items FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: sangrias Staff pode ver sangrias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff pode ver sangrias" ON public.sangrias FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: users Usuário atualiza próprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário atualiza próprio perfil" ON public.users FOR UPDATE TO authenticated USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: addresses Usuário atualiza próprios endereços; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário atualiza próprios endereços" ON public.addresses FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: addresses Usuário deleta próprios endereços; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário deleta próprios endereços" ON public.addresses FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: addresses Usuário insere próprios endereços; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário insere próprios endereços" ON public.addresses FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role)));


--
-- Name: users Usuário vê próprio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário vê próprio perfil" ON public.users FOR SELECT USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Usuário vê próprio role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário vê próprio role" ON public.user_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: orders Usuário vê próprios pedidos ou staff vê todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuário vê próprios pedidos ou staff vê todos" ON public.orders FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'pdv'::public.app_role) OR public.has_role(auth.uid(), 'kitchen'::public.app_role) OR public.has_role(auth.uid(), 'motoboy'::public.app_role)));


--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_register_closures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_register_closures ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_register_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: motoboy_locations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motoboy_locations ENABLE ROW LEVEL SECURITY;

--
-- Name: motoboys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: sangria_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sangria_items ENABLE ROW LEVEL SECURITY;

--
-- Name: sangrias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sangrias ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: visitor_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;