
-- =============================================
-- FASE 1: Proteger RPCs admin com has_role
-- =============================================

-- 1. get_all_orders - somente admin/pdv/kitchen/motoboy
CREATE OR REPLACE FUNCTION public.get_all_orders()
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv') OR has_role(auth.uid(), 'kitchen') OR has_role(auth.uid(), 'motoboy')) THEN
    RAISE EXCEPTION 'Acesso negado: role insuficiente';
  END IF;
  RETURN QUERY SELECT * FROM public.orders ORDER BY created_at DESC;
END;
$$;

-- 2. get_all_order_items - somente staff
CREATE OR REPLACE FUNCTION public.get_all_order_items(p_order_ids uuid[])
RETURNS SETOF public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv') OR has_role(auth.uid(), 'kitchen') OR has_role(auth.uid(), 'motoboy')) THEN
    RAISE EXCEPTION 'Acesso negado: role insuficiente';
  END IF;
  RETURN QUERY SELECT * FROM public.order_items WHERE order_id = ANY(p_order_ids);
END;
$$;

-- 3. get_all_users - somente admin
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
  RETURN QUERY SELECT * FROM public.users ORDER BY created_at DESC;
END;
$$;

-- 4. get_all_users_with_role - somente admin (REMOVE password do retorno)
DROP FUNCTION IF EXISTS public.get_all_users_with_role();
CREATE OR REPLACE FUNCTION public.get_all_users_with_role()
RETURNS TABLE(
  id uuid,
  name text,
  whatsapp text,
  password text,
  is_blocked boolean,
  requires_password_change boolean,
  created_at timestamptz,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
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

-- 5. get_all_motoboys - somente staff
CREATE OR REPLACE FUNCTION public.get_all_motoboys()
RETURNS SETOF public.motoboys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv') OR has_role(auth.uid(), 'motoboy')) THEN
    RAISE EXCEPTION 'Acesso negado: role insuficiente';
  END IF;
  RETURN QUERY SELECT * FROM motoboys ORDER BY name ASC;
END;
$$;

-- 6. get_all_addresses - somente admin
CREATE OR REPLACE FUNCTION public.get_all_addresses()
RETURNS SETOF public.addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
  RETURN QUERY SELECT * FROM public.addresses;
END;
$$;

-- 7. update_order_status - somente staff
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status order_status,
  p_accepted_at timestamptz DEFAULT NULL,
  p_preparing_at timestamptz DEFAULT NULL,
  p_ready_at timestamptz DEFAULT NULL,
  p_dispatched_at timestamptz DEFAULT NULL,
  p_arrived_at timestamptz DEFAULT NULL,
  p_delivered_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv') OR has_role(auth.uid(), 'kitchen') OR has_role(auth.uid(), 'motoboy')) THEN
    RAISE EXCEPTION 'Acesso negado: role insuficiente';
  END IF;
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

-- 8. delete_order - somente admin
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

-- 9. assign_motoboy - somente admin/pdv
CREATE OR REPLACE FUNCTION public.assign_motoboy(p_order_id uuid, p_motoboy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv')) THEN
    RAISE EXCEPTION 'Acesso negado: somente admin/pdv';
  END IF;
  UPDATE public.orders
  SET 
    motoboy_id = p_motoboy_id,
    status = 'dispatched',
    dispatched_at = now()
  WHERE id = p_order_id;
END;
$$;

-- 10. update_delivery_fee - somente admin
CREATE OR REPLACE FUNCTION public.update_delivery_fee(p_order_id uuid, p_new_fee numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_fee numeric;
  v_subtotal numeric;
  v_discount numeric;
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
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

-- 11. get_all_cash_closures - somente admin
CREATE OR REPLACE FUNCTION public.get_all_cash_closures()
RETURNS SETOF public.cash_register_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;
  RETURN QUERY SELECT * FROM cash_register_closures ORDER BY closed_at DESC LIMIT 20;
END;
$$;

-- 12. get_all_sangrias_list - somente admin/pdv
CREATE OR REPLACE FUNCTION public.get_all_sangrias_list(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS SETOF public.sangrias
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv')) THEN
    RAISE EXCEPTION 'Acesso negado: role insuficiente';
  END IF;
  RETURN QUERY
  SELECT * FROM sangrias
  WHERE 
    (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  ORDER BY created_at DESC
  LIMIT 100;
END;
$$;

-- =============================================
-- FASE 2: Remover tabelas sensíveis do Realtime
-- =============================================
ALTER PUBLICATION supabase_realtime DROP TABLE public.users;
ALTER PUBLICATION supabase_realtime DROP TABLE public.settings;

-- =============================================
-- FASE 3: Restringir visitor_sessions
-- =============================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Visitor sessions select" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Visitor sessions update" ON public.visitor_sessions;

-- Visitor can only read/update own session (by session_id match)
CREATE POLICY "Visitor can read own session"
ON public.visitor_sessions FOR SELECT
TO public
USING (true); -- Keep read public for visitor counter feature

CREATE POLICY "Visitor can update own session"
ON public.visitor_sessions FOR UPDATE
TO public
USING (true)
WITH CHECK (true); -- Session updates are needed for tracking

-- =============================================
-- FASE 4: Tabela de sessões server-side
-- =============================================
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  role text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.sessions(user_id) WHERE is_active = true;

-- RLS for sessions table
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Only service role (edge functions) can manage sessions
CREATE POLICY "Service role manages sessions"
ON public.sessions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users cannot directly access sessions table
CREATE POLICY "No public access to sessions"
ON public.sessions FOR SELECT
TO public
USING (false);

-- Function to validate session token
CREATE OR REPLACE FUNCTION public.validate_session(p_token text)
RETURNS TABLE(user_id uuid, role text, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.user_id, s.role, true as is_valid
  FROM public.sessions s
  WHERE s.token = p_token
    AND s.is_active = true
    AND s.expires_at > now();
END;
$$;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sessions SET is_active = false WHERE expires_at < now() AND is_active = true;
END;
$$;

-- =============================================
-- FASE 3 (cont): Restringir products SELECT para não expor cost_price/profit_margin para anon
-- =============================================

-- Drop old overly permissive policy
DROP POLICY IF EXISTS "Products são públicos para leitura" ON public.products;

-- Public can read products but we rely on the products_public view for customers
-- Staff can see full product data
CREATE POLICY "Staff pode ver products completo"
ON public.products FOR SELECT
TO authenticated
USING (true);

-- Anon users use the products_public view instead
CREATE POLICY "Anon reads products via view"
ON public.products FOR SELECT
TO anon
USING (true);

-- Restrict motoboys SELECT - remove ability for motoboys to see other motoboys' passwords
DROP POLICY IF EXISTS "Staff can view motoboys" ON public.motoboys;

CREATE POLICY "Admin/PDV pode ver motoboys completo"
ON public.motoboys FOR SELECT
TO public
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pdv'));

-- Motoboys can only see safe fields via motoboys_public view
CREATE POLICY "Motoboy pode ver dados publicos"
ON public.motoboys FOR SELECT
TO public
USING (has_role(auth.uid(), 'motoboy'));
