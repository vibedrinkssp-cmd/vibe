# Guia de Migração Técnica - Sistema de Delivery

Este documento contém todas as melhorias funcionais, estrutura de banco de dados, funções RPC, políticas RLS e configurações necessárias para atualizar um sistema similar.

---

## Índice

1. [Estrutura do Banco de Dados](#1-estrutura-do-banco-de-dados)
2. [Enums do Sistema](#2-enums-do-sistema)
3. [Funções RPC](#3-funções-rpc)
4. [Políticas RLS](#4-políticas-rls)
5. [Storage Buckets](#5-storage-buckets)
6. [Edge Functions](#6-edge-functions)
7. [Hooks Importantes](#7-hooks-importantes)
8. [Fluxo de Autenticação](#8-fluxo-de-autenticação)
9. [Correções Críticas](#9-correções-críticas)
10. [Secrets Necessários](#10-secrets-necessários)

---

## 1. Estrutura do Banco de Dados

### Tabela: users
```sql
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  password TEXT,
  is_blocked BOOLEAN DEFAULT false,
  requires_password_change BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- IMPORTANTE: Esta tabela usa autenticação customizada, NÃO usa auth.users do Supabase
```

### Tabela: user_roles
```sql
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  role app_role NOT NULL
);

-- Roles disponíveis: 'admin', 'kitchen', 'pdv', 'motoboy', 'customer'
```

### Tabela: addresses
```sql
CREATE TABLE public.addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id),
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT,
  notes TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  is_default BOOLEAN DEFAULT false
);
```

### Tabela: categories
```sql
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  is_special BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: products
```sql
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  sale_price NUMERIC NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  profit_margin NUMERIC DEFAULT 0,
  stock INTEGER DEFAULT 0,
  category_id UUID REFERENCES public.categories(id),
  is_active BOOLEAN DEFAULT true,
  is_prepared BOOLEAN DEFAULT false,
  combo_eligible BOOLEAN DEFAULT false,
  product_type TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: orders
```sql
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id),
  address_id UUID REFERENCES public.addresses(id),
  order_type order_type NOT NULL DEFAULT 'counter',
  status order_status NOT NULL DEFAULT 'pending',
  payment_method payment_method NOT NULL DEFAULT 'cash',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  original_delivery_fee NUMERIC,
  delivery_fee_adjusted BOOLEAN DEFAULT false,
  delivery_fee_adjusted_at TIMESTAMP WITH TIME ZONE,
  delivery_distance NUMERIC,
  discount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  change_for NUMERIC,
  notes TEXT,
  customer_name TEXT,
  salesperson TEXT,
  motoboy_id UUID REFERENCES public.motoboys(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  preparing_at TIMESTAMP WITH TIME ZONE,
  ready_at TIMESTAMP WITH TIME ZONE,
  dispatched_at TIMESTAMP WITH TIME ZONE,
  arrived_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);
```

### Tabela: order_items
```sql
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0
);
```

### Tabela: motoboys
```sql
CREATE TABLE public.motoboys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  password TEXT,
  photo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  slot_number INTEGER,
  current_latitude NUMERIC,
  current_longitude NUMERIC,
  location_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: motoboy_locations
```sql
CREATE TABLE public.motoboy_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  motoboy_id UUID NOT NULL REFERENCES public.motoboys(id),
  order_id UUID REFERENCES public.orders(id),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

### Tabela: banners
```sql
CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: settings
```sql
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_open BOOLEAN DEFAULT true,
  store_address TEXT,
  store_lat NUMERIC,
  store_lng NUMERIC,
  pix_key TEXT,
  min_delivery_fee NUMERIC DEFAULT 4,
  delivery_rate_per_km NUMERIC DEFAULT 1,
  max_delivery_distance NUMERIC DEFAULT 15,
  opening_hours JSONB
);

-- Inserir configuração inicial
INSERT INTO public.settings (id) VALUES (gen_random_uuid());
```

### Tabela: sangrias
```sql
CREATE TABLE public.sangrias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'outros',
  reason TEXT,
  description TEXT,
  responsible TEXT NOT NULL DEFAULT 'Sistema',
  created_by UUID REFERENCES public.users(id),
  closure_id UUID REFERENCES public.cash_register_closures(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: sangria_items
```sql
CREATE TABLE public.sangria_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sangria_id UUID NOT NULL REFERENCES public.sangrias(id),
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
```

### Tabela: cash_register_sessions
```sql
CREATE TABLE public.cash_register_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  current_balance NUMERIC NOT NULL DEFAULT 0,
  cash_supplies NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  opened_by TEXT,
  closed_by TEXT,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  closure_id UUID REFERENCES public.cash_register_closures(id),
  notes TEXT
);
```

### Tabela: cash_register_closures
```sql
CREATE TABLE public.cash_register_closures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.cash_register_sessions(id),
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  shift_type TEXT,
  opening_balance NUMERIC DEFAULT 0,
  expected_cash NUMERIC DEFAULT 0,
  actual_cash NUMERIC DEFAULT 0,
  cash_difference NUMERIC DEFAULT 0,
  cash_supplies NUMERIC DEFAULT 0,
  total_sales NUMERIC DEFAULT 0,
  total_cash NUMERIC DEFAULT 0,
  total_pix NUMERIC DEFAULT 0,
  total_card_credit NUMERIC DEFAULT 0,
  total_card_debit NUMERIC DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  counter_orders_count INTEGER DEFAULT 0,
  delivery_orders_count INTEGER DEFAULT 0,
  total_delivery_fees NUMERIC DEFAULT 0,
  total_product_cost NUMERIC DEFAULT 0,
  total_sangrias NUMERIC DEFAULT 0,
  gross_profit NUMERIC DEFAULT 0,
  real_gross_profit NUMERIC DEFAULT 0,
  net_profit NUMERIC DEFAULT 0,
  card_fees_estimate NUMERIC DEFAULT 0,
  closed_by TEXT,
  notes TEXT,
  closed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### Tabela: visitor_sessions
```sql
CREATE TABLE public.visitor_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  current_page TEXT,
  page_views INTEGER DEFAULT 1,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT true,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
```

### View: motoboys_public
```sql
CREATE VIEW public.motoboys_public AS
SELECT 
  id,
  name,
  is_active,
  slot_number
FROM public.motoboys;

-- Esta view expõe apenas dados públicos dos motoboys (sem senha, whatsapp)
```

---

## 2. Enums do Sistema

```sql
-- Roles de usuário
CREATE TYPE public.app_role AS ENUM (
  'admin',
  'kitchen',
  'pdv',
  'motoboy',
  'customer'
);

-- Status do pedido
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

-- Tipo de pedido
CREATE TYPE public.order_type AS ENUM (
  'delivery',
  'pickup',
  'local',
  'counter'
);

-- Método de pagamento
CREATE TYPE public.payment_method AS ENUM (
  'pix',
  'cash',
  'card_pos',
  'card_credit',
  'card_debit'
);
```

---

## 3. Funções RPC

### IMPORTANTE: Funções SECURITY DEFINER
Todas as funções abaixo usam `SECURITY DEFINER` para bypassar RLS, pois o sistema usa autenticação customizada (não Supabase Auth).

### Funções de Autenticação

```sql
-- Verificar senha de usuário (suporta SHA256 e bcrypt)
CREATE OR REPLACE FUNCTION public.verify_user_password(p_user_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- Login de staff (admin, kitchen, pdv)
CREATE OR REPLACE FUNCTION public.verify_staff_login(p_role text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    found_user RECORD;
BEGIN
    FOR found_user IN 
        SELECT u.* FROM users u
        INNER JOIN user_roles ur ON u.id = ur.user_id
        WHERE ur.role = p_role::app_role
        AND u.is_blocked = FALSE
    LOOP
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

-- Login de motoboy
CREATE OR REPLACE FUNCTION public.verify_motoboy_login(p_motoboy_id uuid, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_motoboy motoboys%ROWTYPE;
  v_stored_password text;
  v_salt text;
  v_hash text;
  v_computed_hash text;
BEGIN
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
    -- Plaintext comparison (legacy)
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

-- Registro de cliente
CREATE OR REPLACE FUNCTION public.register_customer(
  p_name text,
  p_whatsapp text,
  p_password text,
  p_street text,
  p_number text,
  p_neighborhood text,
  p_complement text DEFAULT NULL,
  p_city text DEFAULT 'São Paulo',
  p_state text DEFAULT 'SP',
  p_zip_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
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
```

### Funções de Roles

```sql
-- Obter role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Verificar se usuário tem role específica
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

### Funções de Leitura (Bypass RLS)

```sql
-- Obter todos os usuários
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS SETOF users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.users
  ORDER BY created_at DESC;
END;
$$;

-- Obter usuários com role
CREATE OR REPLACE FUNCTION public.get_all_users_with_role()
RETURNS TABLE(
  id uuid,
  name text,
  whatsapp text,
  password text,
  is_blocked boolean,
  requires_password_change boolean,
  created_at timestamp with time zone,
  role text
)
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Obter clientes para pedidos (dados mínimos)
CREATE OR REPLACE FUNCTION public.get_customers_for_orders()
RETURNS TABLE(id uuid, name text, whatsapp text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name, u.whatsapp
  FROM public.users u
  INNER JOIN public.user_roles ur ON ur.user_id = u.id
  WHERE ur.role = 'customer'
  ORDER BY u.name ASC;
END;
$$;

-- Obter todos os endereços
CREATE OR REPLACE FUNCTION public.get_all_addresses()
RETURNS SETOF addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.addresses;
END;
$$;

-- Obter todos os pedidos
CREATE OR REPLACE FUNCTION public.get_all_orders()
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.orders
  ORDER BY created_at DESC;
END;
$$;

-- Obter pedidos do usuário
CREATE OR REPLACE FUNCTION public.get_user_orders(p_user_id uuid)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.orders
  WHERE user_id = p_user_id
  ORDER BY created_at DESC;
END;
$$;

-- Obter itens de pedidos (CRÍTICO para exibir itens em todas as telas)
CREATE OR REPLACE FUNCTION public.get_all_order_items(p_order_ids uuid[])
RETURNS SETOF order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.order_items
  WHERE order_id = ANY(p_order_ids);
END;
$$;

-- Obter todos os motoboys
CREATE OR REPLACE FUNCTION public.get_all_motoboys()
RETURNS SETOF motoboys
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM motoboys
  ORDER BY name ASC;
END;
$$;

-- Obter todos os fechamentos de caixa
CREATE OR REPLACE FUNCTION public.get_all_cash_closures()
RETURNS SETOF cash_register_closures
LANGUAGE plpgsql
SECURITY DEFINER
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
```

### Funções de Pedidos

```sql
-- Criar pedido de balcão
CREATE OR REPLACE FUNCTION public.create_counter_order(
  p_user_id uuid DEFAULT NULL,
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_payment_method payment_method DEFAULT 'cash',
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_customer_name text DEFAULT 'Balconista',
  p_salesperson text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_order_id uuid;
  v_calculated_total numeric;
BEGIN
  -- Validações
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
  
  -- Validar troco
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
$$;

-- Criar pedido de delivery
CREATE OR REPLACE FUNCTION public.create_delivery_order(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric DEFAULT 0,
  p_delivery_fee numeric DEFAULT 0,
  p_discount numeric DEFAULT 0,
  p_total numeric DEFAULT 0,
  p_payment_method payment_method DEFAULT 'pix',
  p_change_for numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_order_id uuid;
  v_user_blocked boolean;
  v_address_user_id uuid;
  v_calculated_total numeric;
BEGIN
  -- Verificar usuário
  SELECT is_blocked INTO v_user_blocked FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado';
  END IF;
  IF v_user_blocked = true THEN
    RAISE EXCEPTION 'Usuário bloqueado';
  END IF;
  
  -- Verificar endereço
  SELECT user_id INTO v_address_user_id FROM addresses WHERE id = p_address_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Endereço não encontrado';
  END IF;
  IF v_address_user_id != p_user_id THEN
    RAISE EXCEPTION 'Endereço não pertence ao usuário';
  END IF;
  
  -- Validações
  IF p_subtotal < 0 OR p_delivery_fee < 0 OR p_total < 0 THEN
    RAISE EXCEPTION 'Valores não podem ser negativos';
  END IF;
  
  IF p_discount < 0 OR p_discount > p_subtotal THEN
    RAISE EXCEPTION 'Desconto inválido';
  END IF;
  
  v_calculated_total := p_subtotal + COALESCE(p_delivery_fee, 0) - COALESCE(p_discount, 0);
  IF ABS(v_calculated_total - p_total) > 0.10 THEN
    RAISE EXCEPTION 'Cálculo do total inconsistente';
  END IF;
  
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

-- Criar itens do pedido
CREATE OR REPLACE FUNCTION public.create_order_items(p_order_id uuid, p_items text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
  -- Verificar pedido
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  
  IF v_order_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Não é possível modificar pedido finalizado';
  END IF;
  
  items_jsonb := p_items::jsonb;
  
  -- Validar cada item
  FOR current_item IN SELECT * FROM jsonb_array_elements(items_jsonb)
  LOOP
    v_qty := (current_item->>'quantity')::integer;
    v_unit_price := (current_item->>'unit_price')::numeric;
    v_total_price := (current_item->>'total_price')::numeric;
    v_product_name := current_item->>'product_name';
    
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
  
  -- Inserir itens
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

-- Atualizar status do pedido
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status order_status,
  p_accepted_at timestamp with time zone DEFAULT NULL,
  p_preparing_at timestamp with time zone DEFAULT NULL,
  p_ready_at timestamp with time zone DEFAULT NULL,
  p_dispatched_at timestamp with time zone DEFAULT NULL,
  p_arrived_at timestamp with time zone DEFAULT NULL,
  p_delivered_at timestamp with time zone DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Deletar pedido
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$$;

-- Atualizar taxa de entrega
CREATE OR REPLACE FUNCTION public.update_delivery_fee(p_order_id uuid, p_new_fee numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Atribuir motoboy ao pedido
CREATE OR REPLACE FUNCTION public.assign_motoboy(p_order_id uuid, p_motoboy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
```

### Funções de Motoboy

```sql
-- Criar motoboy
CREATE OR REPLACE FUNCTION public.create_motoboy(
  p_name text,
  p_whatsapp text,
  p_is_active boolean DEFAULT true,
  p_password text DEFAULT NULL,
  p_slot_number integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Atualizar motoboy
CREATE OR REPLACE FUNCTION public.update_motoboy(
  p_id uuid,
  p_name text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_password text DEFAULT NULL,
  p_slot_number integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Deletar motoboy
CREATE OR REPLACE FUNCTION public.delete_motoboy(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM motoboys WHERE id = p_id;
END;
$$;

-- Atualizar localização do motoboy
CREATE OR REPLACE FUNCTION public.update_motoboy_location(
  p_motoboy_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_order_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Atualizar localização atual
  UPDATE public.motoboys
  SET 
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    location_updated_at = now()
  WHERE id = p_motoboy_id;
  
  -- Inserir no histórico
  INSERT INTO public.motoboy_locations (motoboy_id, order_id, latitude, longitude)
  VALUES (p_motoboy_id, p_order_id, p_latitude, p_longitude);
END;
$$;
```

### Funções de Caixa

```sql
-- Abrir caixa
CREATE OR REPLACE FUNCTION public.open_cash_register(
  p_opening_balance numeric DEFAULT 0,
  p_opened_by text DEFAULT 'Sistema'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_session_id UUID;
  v_new_session_id UUID;
BEGIN
  -- Verificar se já existe sessão aberta
  SELECT id INTO v_existing_session_id 
  FROM cash_register_sessions 
  WHERE status = 'open' 
  LIMIT 1;
  
  IF v_existing_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe uma sessão de caixa aberta';
  END IF;
  
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

-- Fechar caixa
CREATE OR REPLACE FUNCTION public.close_cash_register(
  p_session_id uuid,
  p_closed_by text DEFAULT 'Sistema'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Adicionar suprimento ao caixa
CREATE OR REPLACE FUNCTION public.add_cash_supply(p_session_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Obter saldo atual do caixa
CREATE OR REPLACE FUNCTION public.get_current_cash_balance()
RETURNS TABLE(
  session_id uuid,
  opening_balance numeric,
  cash_sales numeric,
  cash_withdrawals numeric,
  cash_supplies numeric,
  current_balance numeric,
  session_status text,
  opened_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session cash_register_sessions%ROWTYPE;
  v_cash_sales NUMERIC;
  v_withdrawals NUMERIC;
BEGIN
  SELECT * INTO v_session 
  FROM cash_register_sessions 
  WHERE status = 'open' 
  ORDER BY opened_at DESC 
  LIMIT 1;
  
  IF NOT FOUND THEN
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
  
  -- Calcular vendas em dinheiro
  SELECT COALESCE(SUM(total), 0) INTO v_cash_sales
  FROM orders
  WHERE payment_method = 'cash'
  AND status NOT IN ('pending', 'cancelled')
  AND created_at >= v_session.opened_at;
  
  -- Calcular sangrias
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

-- Criar fechamento de caixa
CREATE OR REPLACE FUNCTION public.create_cash_closure(
  p_period_start timestamp with time zone,
  p_period_end timestamp with time zone,
  p_shift_type text,
  p_opening_balance numeric,
  p_expected_cash numeric,
  p_actual_cash numeric,
  p_cash_difference numeric,
  p_total_sales numeric,
  p_total_pix numeric,
  p_total_card_credit numeric,
  p_total_card_debit numeric,
  p_total_cash numeric,
  p_gross_profit numeric,
  p_net_profit numeric,
  p_total_sangrias numeric,
  p_total_orders integer,
  p_notes text DEFAULT NULL,
  p_closed_by text DEFAULT NULL,
  p_total_delivery_fees numeric DEFAULT 0,
  p_total_product_cost numeric DEFAULT 0,
  p_real_gross_profit numeric DEFAULT 0,
  p_cash_supplies numeric DEFAULT 0,
  p_counter_orders_count integer DEFAULT 0,
  p_delivery_orders_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Calcular lucro real
CREATE OR REPLACE FUNCTION public.calculate_real_profit(
  p_start timestamp with time zone,
  p_end timestamp with time zone
)
RETURNS TABLE(
  total_revenue numeric,
  total_product_cost numeric,
  gross_profit numeric,
  total_delivery_fees numeric,
  counter_orders_count bigint,
  delivery_orders_count bigint,
  total_orders_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
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
```

---

## 4. Políticas RLS

### IMPORTANTE: Autenticação Customizada
Este sistema usa autenticação customizada (não Supabase Auth). As políticas RLS usam `auth.uid()` mas muitas operações precisam bypassar via funções RPC com `SECURITY DEFINER`.

### Políticas para users

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Usuário vê próprio perfil
CREATE POLICY "Usuário vê próprio perfil" ON public.users
FOR SELECT USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Usuário atualiza próprio perfil
CREATE POLICY "Usuário atualiza próprio perfil" ON public.users
FOR UPDATE USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Admin pode deletar users
CREATE POLICY "Admin pode deletar users" ON public.users
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- NÃO permitir INSERT direto (usar RPC register_customer)
```

### Políticas para user_roles

```sql
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Usuário vê próprio role
CREATE POLICY "Usuário vê próprio role" ON public.user_roles
FOR SELECT USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Admin gerencia roles
CREATE POLICY "Admin gerencia roles" ON public.user_roles
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para addresses

```sql
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- Usuário vê próprios endereços
CREATE POLICY "Address visibility" ON public.addresses
FOR SELECT USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Usuário insere próprios endereços
CREATE POLICY "Usuário insere próprios endereços" ON public.addresses
FOR INSERT WITH CHECK ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Usuário atualiza próprios endereços
CREATE POLICY "Usuário atualiza próprios endereços" ON public.addresses
FOR UPDATE USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- Usuário deleta próprios endereços
CREATE POLICY "Usuário deleta próprios endereços" ON public.addresses
FOR DELETE USING ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para categories

```sql
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "Categories são públicas para leitura" ON public.categories
FOR SELECT USING (true);

-- Admin gerencia
CREATE POLICY "Admin pode inserir categories" ON public.categories
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin pode atualizar categories" ON public.categories
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin pode deletar categories" ON public.categories
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para products

```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "Products são públicos para leitura" ON public.products
FOR SELECT USING (true);

-- Admin/PDV gerencia
CREATE POLICY "Admin/PDV pode inserir products" ON public.products
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Admin/PDV pode atualizar products" ON public.products
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Admin pode deletar products" ON public.products
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para orders

```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Usuário vê próprios pedidos ou staff vê todos
CREATE POLICY "Usuário vê próprios pedidos ou staff vê todos" ON public.orders
FOR SELECT USING (
  (user_id = auth.uid()) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role) OR 
  has_role(auth.uid(), 'kitchen'::app_role) OR 
  has_role(auth.uid(), 'motoboy'::app_role)
);

-- Permitir criação de pedidos
CREATE POLICY "Permitir criação de pedidos" ON public.orders
FOR INSERT WITH CHECK (
  (order_type = 'counter'::order_type) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role) OR 
  ((auth.uid() IS NOT NULL) AND (user_id = auth.uid()))
);

-- Staff pode atualizar pedidos
CREATE POLICY "Staff pode atualizar pedidos" ON public.orders
FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role) OR 
  has_role(auth.uid(), 'kitchen'::app_role) OR 
  has_role(auth.uid(), 'motoboy'::app_role)
);

-- Admin pode deletar pedidos
CREATE POLICY "Admin pode deletar pedidos" ON public.orders
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para order_items

```sql
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Visibilidade baseada no pedido
CREATE POLICY "Order items visible to order owner or staff" ON public.order_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id 
    AND (
      o.user_id = auth.uid() OR 
      has_role(auth.uid(), 'admin'::app_role) OR 
      has_role(auth.uid(), 'pdv'::app_role) OR 
      has_role(auth.uid(), 'kitchen'::app_role) OR 
      has_role(auth.uid(), 'motoboy'::app_role)
    )
  )
);

-- Inserção via RPC ou staff
CREATE POLICY "Inserção de order_items apenas via RPC" ON public.order_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_items.order_id 
    AND o.status NOT IN ('delivered', 'cancelled')
  )
);

CREATE POLICY "Staff pode inserir order_items" ON public.order_items
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Staff pode atualizar
CREATE POLICY "Staff pode atualizar order_items" ON public.order_items
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Admin pode deletar
CREATE POLICY "Admin pode deletar order_items" ON public.order_items
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para motoboys

```sql
ALTER TABLE public.motoboys ENABLE ROW LEVEL SECURITY;

-- Staff pode ver motoboys
CREATE POLICY "Staff can view motoboys" ON public.motoboys
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role) OR 
  has_role(auth.uid(), 'motoboy'::app_role)
);

-- Admin gerencia motoboys
CREATE POLICY "Admin pode gerenciar motoboys" ON public.motoboys
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para motoboy_locations

```sql
ALTER TABLE public.motoboy_locations ENABLE ROW LEVEL SECURITY;

-- Staff pode ver localizações
CREATE POLICY "Staff pode ver localizações" ON public.motoboy_locations
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role) OR 
  has_role(auth.uid(), 'motoboy'::app_role)
);

-- Clientes podem ver localização do motoboy do seu pedido
CREATE POLICY "Clientes podem ver localização do motoboy do seu pedido" ON public.motoboy_locations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = motoboy_locations.order_id AND o.user_id = auth.uid()
  )
);

-- Motoboys podem inserir localizações
CREATE POLICY "Motoboys podem inserir localizações" ON public.motoboy_locations
FOR INSERT WITH CHECK (has_role(auth.uid(), 'motoboy'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para banners

```sql
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "Banners são públicos para leitura" ON public.banners
FOR SELECT USING (true);

-- Admin gerencia
CREATE POLICY "Admin pode gerenciar banners" ON public.banners
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para settings

```sql
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Leitura pública
CREATE POLICY "Settings são públicas para leitura" ON public.settings
FOR SELECT USING (true);

-- Apenas admin pode modificar
CREATE POLICY "Apenas admin pode inserir settings" ON public.settings
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Apenas admin pode atualizar settings" ON public.settings
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para sangrias e sangria_items

```sql
ALTER TABLE public.sangrias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sangria_items ENABLE ROW LEVEL SECURITY;

-- Staff pode ver sangrias
CREATE POLICY "Staff pode ver sangrias" ON public.sangrias
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode gerenciar sangrias" ON public.sangrias
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode ver sangria_items" ON public.sangria_items
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode gerenciar sangria_items" ON public.sangria_items
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));
```

### Políticas para cash_register

```sql
ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_closures ENABLE ROW LEVEL SECURITY;

-- Admin pode ver e gerenciar sessões de caixa
CREATE POLICY "Admin pode ver sessões de caixa" ON public.cash_register_sessions
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin pode gerenciar sessões de caixa" ON public.cash_register_sessions
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin pode ver e gerenciar fechamentos
CREATE POLICY "Admin pode ver fechamentos" ON public.cash_register_closures
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin pode gerenciar fechamentos" ON public.cash_register_closures
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
```

### Políticas para visitor_sessions

```sql
ALTER TABLE public.visitor_sessions ENABLE ROW LEVEL SECURITY;

-- Permitir inserção pública
CREATE POLICY "Allow insert visitor sessions" ON public.visitor_sessions
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert visitor sessions" ON public.visitor_sessions
FOR INSERT WITH CHECK (true);

-- Permitir leitura/update própria sessão
CREATE POLICY "Allow select own visitor session" ON public.visitor_sessions
FOR SELECT USING (true);

CREATE POLICY "Allow update own visitor session" ON public.visitor_sessions
FOR UPDATE USING (true) WITH CHECK (session_id = session_id);

CREATE POLICY "Anyone can update their own session" ON public.visitor_sessions
FOR UPDATE USING (true);

-- Staff pode ver todas e deletar
CREATE POLICY "Staff can view all visitor sessions" ON public.visitor_sessions
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff can delete visitor sessions" ON public.visitor_sessions
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));
```

---

## 5. Storage Buckets

```sql
-- Criar bucket para imagens
INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true);

-- Políticas para o bucket images
CREATE POLICY "Imagens são públicas para leitura"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

CREATE POLICY "Staff pode fazer upload de imagens"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'images' AND (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role)
));

CREATE POLICY "Staff pode atualizar imagens"
ON storage.objects FOR UPDATE
USING (bucket_id = 'images' AND (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pdv'::app_role)
));

CREATE POLICY "Admin pode deletar imagens"
ON storage.objects FOR DELETE
USING (bucket_id = 'images' AND has_role(auth.uid(), 'admin'::app_role));
```

---

## 6. Edge Functions

### supabase/functions/auth-login/index.ts
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { whatsapp, password } = await req.json()

    if (!whatsapp || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'WhatsApp e senha são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Buscar usuário
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('whatsapp', whatsapp)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    if (user.is_blocked) {
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário bloqueado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Verificar senha
    const { data: passwordValid } = await supabase.rpc('verify_user_password', {
      p_user_id: user.id,
      p_password: password
    })

    if (!passwordValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Senha incorreta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Buscar role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    // Buscar endereço padrão
    const { data: address } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          whatsapp: user.whatsapp,
          role: roleData?.role || 'customer',
          requiresPasswordChange: user.requires_password_change
        },
        address: address || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

### supabase/functions/auth-verify/index.ts
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, whatsapp, is_blocked')
      .eq('id', userId)
      .single()

    if (error || !user || user.is_blocked) {
      return new Response(
        JSON.stringify({ valid: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          id: user.id,
          name: user.name,
          whatsapp: user.whatsapp,
          role: roleData?.role || 'customer'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

### supabase/functions/google-maps/index.ts
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, params } = await req.json()
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')

    if (!apiKey) {
      throw new Error('Google Maps API key not configured')
    }

    let url = ''
    
    switch (action) {
      case 'geocode':
        url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(params.address)}&key=${apiKey}`
        break
      case 'reverseGeocode':
        url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.lat},${params.lng}&key=${apiKey}`
        break
      case 'directions':
        url = `https://maps.googleapis.com/maps/api/directions/json?origin=${params.origin}&destination=${params.destination}&key=${apiKey}`
        break
      case 'distanceMatrix':
        url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${params.origins}&destinations=${params.destinations}&key=${apiKey}`
        break
      default:
        throw new Error('Invalid action')
    }

    const response = await fetch(url)
    const data = await response.json()

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

### supabase/functions/mercadopago/index.ts
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, data } = await req.json()
    const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')

    if (!accessToken) {
      throw new Error('MercadoPago access token not configured')
    }

    if (action === 'createPixPayment') {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          transaction_amount: data.amount,
          description: data.description,
          payment_method_id: 'pix',
          payer: {
            email: data.email || 'cliente@vibedrinks.com',
          },
        }),
      })

      const payment = await response.json()

      return new Response(
        JSON.stringify({
          id: payment.id,
          qr_code: payment.point_of_interaction?.transaction_data?.qr_code,
          qr_code_base64: payment.point_of_interaction?.transaction_data?.qr_code_base64,
          status: payment.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'checkPaymentStatus') {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${data.paymentId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      const payment = await response.json()

      return new Response(
        JSON.stringify({
          id: payment.id,
          status: payment.status,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

---

## 7. Hooks Importantes

### Hook de Order Items com Bypass de RLS

```typescript
// src/hooks/use-supabase-data.ts

export function useOrderItems(
  orderIds: string[], 
  options: { 
    enabled?: boolean; 
    refetchInterval?: number; 
    useAdminRpc?: boolean  // CRÍTICO: usar true para staff/admin
  } = {}
) {
  const { enabled = true, refetchInterval, useAdminRpc = false } = options;
  
  return useQuery<OrderItem[]>({
    queryKey: ['order-items', orderIds.join(','), { useAdminRpc }],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      
      // Use RPC function para bypass RLS (autenticação customizada)
      if (useAdminRpc) {
        const { data, error } = await supabase.rpc('get_all_order_items', {
          p_order_ids: orderIds,
        });
        if (error) throw error;
        return (data || []).map(mapOrderItem);
      }
      
      // Query direta (funciona só com auth.uid() válido)
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);
      if (error) throw error;
      return (data || []).map(mapOrderItem);
    },
    enabled: enabled && orderIds.length > 0,
    refetchInterval,
  });
}
```

### Hook de Tracking de Motoboy

```typescript
// src/hooks/use-motoboy-tracking.ts

export function useMotoboyTracking(motoboyId: string | null, enabled = false) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasStartedRef = useRef(false);

  // Auto-start tracking quando habilitado e motoboy logado
  useEffect(() => {
    if (enabled && motoboyId && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startTracking();
    }
  }, [enabled, motoboyId]);

  const startTracking = useCallback(() => {
    if (!motoboyId || !navigator.geolocation) {
      setError('Geolocalização não disponível');
      return;
    }

    setIsTracking(true);
    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });

        // Atualizar localização no banco via RPC
        try {
          await supabase.rpc('update_motoboy_location', {
            p_motoboy_id: motoboyId,
            p_latitude: latitude,
            p_longitude: longitude,
          });
        } catch (err) {
          console.error('Erro ao atualizar localização:', err);
        }
      },
      (err) => {
        setError(err.message);
        setIsTracking(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );
  }, [motoboyId]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

  return { location, isTracking, error, startTracking, stopTracking };
}
```

---

## 8. Fluxo de Autenticação

### IMPORTANTE: Autenticação Customizada
Este sistema NÃO usa Supabase Auth. Usa autenticação customizada com tabelas `users` e `user_roles`.

### Fluxo de Login de Cliente

1. Usuário envia WhatsApp + senha
2. Edge function `auth-login` busca usuário na tabela `users`
3. Verifica se não está bloqueado
4. Chama RPC `verify_user_password` para validar senha
5. Busca role em `user_roles`
6. Busca endereço padrão em `addresses`
7. Retorna dados do usuário + endereço

### Fluxo de Login de Staff (Admin/Kitchen/PDV)

1. Usuário envia role + senha
2. Chama RPC `verify_staff_login`
3. Função busca todos usuários com a role especificada
4. Valida senha para cada um até encontrar match
5. Retorna dados do usuário autenticado

### Fluxo de Login de Motoboy

1. Motoboy seleciona seu nome da lista (via view `motoboys_public`)
2. Envia ID + senha
3. Chama RPC `verify_motoboy_login`
4. Valida senha (suporta hash SHA256 ou texto plano legado)
5. Retorna dados do motoboy

### Armazenamento de Sessão

```typescript
// localStorage keys
'customer' // { id, name, whatsapp, role }
'customer_address' // endereço atual
'staff_user' // { id, name, role } para admin/kitchen/pdv
'motoboy' // { id, name, whatsapp }
```

---

## 9. Correções Críticas

### Problema 1: Itens do Pedido Não Aparecem
**Causa:** RLS bloqueando acesso porque `auth.uid()` é null (autenticação customizada)

**Solução:** Usar RPC `get_all_order_items` com `SECURITY DEFINER`

```typescript
// Em todas as telas que mostram itens (Kitchen, Motoboy, Orders, Profile)
const { data: orderItems = [] } = useOrderItems(orderIds, {
  enabled: orders.length > 0,
  useAdminRpc: true, // CRÍTICO
});
```

### Problema 2: Motoboys Não Aparecem no Tracking
**Causa:** Query direta na tabela `motoboys` bloqueada por RLS

**Solução:** Usar RPC `get_all_motoboys`

```typescript
// Em TrackingTab.tsx
const fetchMotoboys = async () => {
  const { data, error } = await supabase.rpc('get_all_motoboys');
  if (!error && data) {
    setMotoboys(data.filter((m: any) => m.is_active));
  }
};
```

### Problema 3: Motoboy Não Aparece Online
**Causa:** GPS não iniciando automaticamente ao logar

**Solução:** Solicitar permissão GPS ao logar e iniciar tracking automático

```typescript
// Em Motoboy.tsx
useEffect(() => {
  if (motoboy?.id) {
    navigator.geolocation.getCurrentPosition(
      () => {
        startTracking();
        toast.success("GPS ativado com sucesso!");
      },
      () => {
        toast.error("Ative o GPS para receber pedidos");
      }
    );
  }
}, [motoboy?.id]);
```

### Problema 4: Dados de Usuários/Endereços Não Carregam no Admin
**Causa:** RLS bloqueando acesso

**Solução:** Usar RPCs com `SECURITY DEFINER`

```typescript
// get_all_users() - para listar todos os usuários
// get_all_addresses() - para listar todos os endereços
// get_all_orders() - para listar todos os pedidos
```

---

## 10. Secrets Necessários

### Secrets do Supabase (Edge Functions)

| Nome | Descrição |
|------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima (publishable) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço (para bypass RLS) |
| `GOOGLE_MAPS_API_KEY` | API key do Google Maps |
| `MERCADO_PAGO_ACCESS_TOKEN` | Token de acesso do MercadoPago |
| `SERPER_API_KEY` | API key do Serper (busca de imagens) |

### Variáveis de Ambiente do Frontend

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key
VITE_SUPABASE_PROJECT_ID=seu-project-id
```

---

## Checklist de Migração

- [ ] Criar todos os enums
- [ ] Criar todas as tabelas na ordem correta (respeitar foreign keys)
- [ ] Criar view `motoboys_public`
- [ ] Criar todas as funções RPC
- [ ] Habilitar RLS em todas as tabelas
- [ ] Criar todas as políticas RLS
- [ ] Criar bucket de storage
- [ ] Deploy das edge functions
- [ ] Configurar secrets
- [ ] Criar usuário admin inicial:

```sql
-- Criar usuário admin
INSERT INTO users (name, whatsapp, password, is_blocked)
VALUES ('Admin', '11999999999', 'sha256:salt:hash', false);

-- Adicionar role admin
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE whatsapp = '11999999999';

-- Criar configuração inicial
INSERT INTO settings (id) VALUES (gen_random_uuid());
```

---

## 11. Deploy em Produção (Render.com)

### Configuração do Render

1. **Criar Static Site**:
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`

2. **Variáveis de Ambiente**:
```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_SUPABASE_PROJECT_ID=seu-projeto-id
VITE_GOOGLE_MAPS_KEY=sua-chave-opcional
```

3. **Rewrite Rule para SPA**:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: `Rewrite`

### Arquivos Necessários

#### render.yaml (Blueprint)
```yaml
services:
  - type: web
    name: seu-app
    runtime: static
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    routes:
      - type: rewrite
        source: /*
        destination: /index.html
```

#### public/_redirects (Fallback SPA)
```
/*    /index.html   200
```

#### public/manifest.json (PWA)
```json
{
  "name": "Seu App - Nome Completo",
  "short_name": "Seu App",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#7c3aed",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Domínio Personalizado

1. Adicionar domínio no Render (Settings → Custom Domains)
2. Configurar DNS:
   - **Domínio raiz**: `A` record → IP do Render
   - **WWW**: `CNAME` → `seu-app.onrender.com`
3. Aguardar SSL automático

### Meta Tags SEO (index.html)
```html
<meta name="description" content="Descrição do seu app" />
<meta property="og:title" content="Título para redes sociais" />
<meta property="og:description" content="Descrição para compartilhamento" />
<meta property="og:image" content="/og-image.png" />
<meta name="theme-color" content="#7c3aed" />
<link rel="manifest" href="/manifest.json" />
```

---

## Checklist de Migração

- [ ] Criar todos os enums
- [ ] Criar todas as tabelas na ordem correta (respeitar foreign keys)
- [ ] Criar view `motoboys_public`
- [ ] Criar todas as funções RPC
- [ ] Habilitar RLS em todas as tabelas
- [ ] Criar todas as políticas RLS
- [ ] Criar bucket de storage
- [ ] Deploy das edge functions
- [ ] Configurar secrets
- [ ] Criar usuário admin inicial:

```sql
-- Criar usuário admin
INSERT INTO users (name, whatsapp, password, is_blocked)
VALUES ('Admin', '11999999999', 'sha256:salt:hash', false);

-- Adicionar role admin
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM users WHERE whatsapp = '11999999999';

-- Criar configuração inicial
INSERT INTO settings (id) VALUES (gen_random_uuid());
```

## Checklist de Deploy (Render.com)

- [ ] Repositório conectado
- [ ] Build command: `npm install && npm run build`
- [ ] Publish directory: `dist`
- [ ] Variáveis de ambiente configuradas
- [ ] Rewrite rule `/* → /index.html`
- [ ] Domínio personalizado adicionado
- [ ] DNS configurado
- [ ] SSL ativo
- [ ] manifest.json criado
- [ ] Meta tags SEO configuradas

---

## Contato para Dúvidas

Este documento foi gerado automaticamente para auxiliar na evolução do sistema. Em caso de dúvidas sobre implementações específicas, consulte o código fonte original.
