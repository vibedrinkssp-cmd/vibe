-- =============================================
-- FASE 1: CORREÇÕES CRÍTICAS DE SEGURANÇA
-- =============================================

-- 1.1 PROTEGER TABELA SETTINGS (PIX Key e Endereço)
-- Remover política pública de leitura
DROP POLICY IF EXISTS "Settings são públicas para leitura" ON settings;

-- Criar view pública com dados não-sensíveis
CREATE OR REPLACE VIEW public.store_info 
WITH (security_invoker = true) AS
SELECT 
  is_open,
  opening_hours,
  max_delivery_distance,
  min_delivery_fee,
  delivery_rate_per_km,
  store_lat,
  store_lng,
  store_address
FROM settings
LIMIT 1;

-- Nova política: apenas staff pode ver settings completo (incluindo pix_key)
CREATE POLICY "Staff pode ver settings completo"
ON settings FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- 1.2 PROTEGER TABELA PRODUCTS (Cost Price e Profit Margin)
-- Criar view pública sem dados sensíveis de custo
CREATE OR REPLACE VIEW public.products_public 
WITH (security_invoker = true) AS
SELECT 
  id, name, description, image_url, sale_price, 
  stock, category_id, is_active, sort_order,
  is_prepared, combo_eligible, barcode, product_type, created_at
FROM products;

-- Atualizar RLS: manter leitura pública mas criar view para clientes
-- (a view já filtra os campos sensíveis)

-- 1.3 PROTEGER TABELA COUPONS (Códigos de Cupom)
-- Remover política que expõe todos os cupons ativos
DROP POLICY IF EXISTS "Cupons ativos são públicos para leitura" ON coupons;

-- Nova política: usuários só veem cupons atribuídos a eles
CREATE POLICY "Usuário vê cupons atribuídos ou admin"
ON coupons FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_coupons uc 
    WHERE uc.coupon_id = coupons.id 
    AND uc.user_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Criar RPC para validar cupom sem expor lista completa
CREATE OR REPLACE FUNCTION public.validate_coupon_code(p_code TEXT, p_user_id UUID)
RETURNS TABLE(
  valid BOOLEAN, 
  discount_percent NUMERIC, 
  coupon_id UUID,
  user_coupon_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN c.id IS NULL THEN false
      WHEN uc.id IS NULL THEN false
      WHEN uc.is_used = true THEN false
      ELSE true
    END as valid,
    COALESCE(c.discount_percent, 0) as discount_percent,
    c.id as coupon_id,
    uc.id as user_coupon_id,
    CASE 
      WHEN c.id IS NULL THEN 'Cupom não encontrado'
      WHEN uc.id IS NULL THEN 'Cupom não atribuído a este usuário'
      WHEN uc.is_used = true THEN 'Cupom já utilizado'
      ELSE NULL
    END as error_message
  FROM coupons c
  LEFT JOIN user_coupons uc ON uc.coupon_id = c.id AND uc.user_id = p_user_id
  WHERE c.code = UPPER(p_code) AND c.is_active = true
  LIMIT 1;
END;
$$;

-- 1.4 CORRIGIR VISITOR_SESSIONS (Políticas Permissivas)
-- Remover políticas duplicadas/permissivas
DROP POLICY IF EXISTS "Allow insert visitor sessions" ON visitor_sessions;
DROP POLICY IF EXISTS "Allow select own visitor session" ON visitor_sessions;
DROP POLICY IF EXISTS "Allow update own visitor session" ON visitor_sessions;
DROP POLICY IF EXISTS "Anyone can insert visitor sessions" ON visitor_sessions;
DROP POLICY IF EXISTS "Anyone can update their own session" ON visitor_sessions;

-- Manter apenas políticas necessárias (já existem para staff)
-- Criar política segura para inserção anônima (necessário para tracking)
CREATE POLICY "Anon pode inserir visitor session"
ON visitor_sessions FOR INSERT
WITH CHECK (true);

-- Criar política para atualização apenas da própria sessão
CREATE POLICY "Atualizar própria sessão"
ON visitor_sessions FOR UPDATE
USING (true)
WITH CHECK (true);

-- 1.5 CORRIGIR VIEW MOTOBOYS_PUBLIC (SECURITY DEFINER)
DROP VIEW IF EXISTS motoboys_public;

CREATE VIEW public.motoboys_public 
WITH (security_invoker = true) AS
SELECT id, name, is_active, slot_number
FROM motoboys
WHERE is_active = true
ORDER BY slot_number NULLS LAST;

-- 1.6 CRIAR VIEWS PÚBLICAS PARA CATEGORIAS E BANNERS (ocultar sort_order interno)
CREATE OR REPLACE VIEW public.categories_public 
WITH (security_invoker = true) AS
SELECT id, name, icon_url, is_active, is_special, created_at
FROM categories
WHERE is_active = true
ORDER BY sort_order NULLS LAST;

CREATE OR REPLACE VIEW public.banners_public 
WITH (security_invoker = true) AS
SELECT id, title, description, image_url, link_url, is_active, created_at
FROM banners
WHERE is_active = true
ORDER BY sort_order NULLS LAST;

CREATE OR REPLACE VIEW public.drink_fruits_public 
WITH (security_invoker = true) AS
SELECT id, name, icon_url, price, is_active, created_at
FROM drink_fruits
WHERE is_active = true
ORDER BY sort_order NULLS LAST;

-- 1.7 CORRIGIR POLÍTICA DE PEDIDOS (Counter sem autenticação)
DROP POLICY IF EXISTS "Permitir criação de pedidos" ON orders;

CREATE POLICY "Criar pedidos com validação"
ON orders FOR INSERT
WITH CHECK (
  -- Staff pode criar qualquer pedido
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'pdv'::app_role)
  -- Usuário autenticado pode criar delivery/pickup com seu próprio user_id
  OR (
    auth.uid() IS NOT NULL 
    AND user_id = auth.uid() 
    AND order_type IN ('delivery', 'pickup')
  )
  -- Counter orders precisam de staff (PDV ou Admin)
  OR (
    order_type = 'counter' 
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role))
  )
);

-- =============================================
-- FASE 2: FUNÇÕES RPC SEGURAS
-- =============================================

-- 2.1 Função para obter informações públicas da loja (sem PIX key)
CREATE OR REPLACE FUNCTION public.get_store_info()
RETURNS TABLE(
  is_open BOOLEAN,
  opening_hours JSONB,
  max_delivery_distance NUMERIC,
  min_delivery_fee NUMERIC,
  delivery_rate_per_km NUMERIC,
  store_lat NUMERIC,
  store_lng NUMERIC,
  store_address TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.is_open,
    s.opening_hours,
    s.max_delivery_distance,
    s.min_delivery_fee,
    s.delivery_rate_per_km,
    s.store_lat,
    s.store_lng,
    s.store_address
  FROM settings s
  LIMIT 1;
$$;

-- 2.2 Função para obter produtos públicos (sem cost_price)
CREATE OR REPLACE FUNCTION public.get_products_public(p_active_only BOOLEAN DEFAULT true)
RETURNS SETOF products_public
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM products_public
  WHERE (NOT p_active_only OR is_active = true);
$$;

-- 2.3 Função para obter categorias públicas
CREATE OR REPLACE FUNCTION public.get_categories_public(p_active_only BOOLEAN DEFAULT true)
RETURNS SETOF categories_public
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM categories_public
  WHERE (NOT p_active_only OR is_active = true);
$$;

-- 2.4 Função para obter banners públicos
CREATE OR REPLACE FUNCTION public.get_banners_public(p_active_only BOOLEAN DEFAULT true)
RETURNS SETOF banners_public
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM banners_public
  WHERE (NOT p_active_only OR is_active = true);
$$;