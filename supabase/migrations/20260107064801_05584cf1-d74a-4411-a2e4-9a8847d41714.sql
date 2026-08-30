-- Tabela de cupons disponíveis
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percent NUMERIC NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.users(id)
);

-- Tabela de cupons atribuídos a usuários
CREATE TABLE public.user_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  assigned_by UUID REFERENCES public.users(id),
  used_at TIMESTAMPTZ,
  used_in_order_id UUID REFERENCES public.orders(id),
  is_used BOOLEAN DEFAULT false,
  UNIQUE (user_id, coupon_id)
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_coupons ENABLE ROW LEVEL SECURITY;

-- Policies para coupons
CREATE POLICY "Admin pode gerenciar cupons"
ON public.coupons FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Cupons ativos são públicos para leitura"
ON public.coupons FOR SELECT
USING (is_active = true);

-- Policies para user_coupons
CREATE POLICY "Admin pode gerenciar atribuições de cupons"
ON public.user_coupons FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuário vê seus próprios cupons"
ON public.user_coupons FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Usuário pode usar seu próprio cupom"
ON public.user_coupons FOR UPDATE
USING (user_id = auth.uid() AND is_used = false)
WITH CHECK (user_id = auth.uid());

-- Função para usar cupom
CREATE OR REPLACE FUNCTION public.use_coupon(p_user_coupon_id UUID, p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_coupon user_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_user_coupon FROM user_coupons WHERE id = p_user_coupon_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;
  
  IF v_user_coupon.is_used THEN
    RAISE EXCEPTION 'Cupom já foi utilizado';
  END IF;
  
  IF v_user_coupon.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cupom não pertence a este usuário';
  END IF;
  
  UPDATE user_coupons
  SET is_used = true, used_at = now(), used_in_order_id = p_order_id
  WHERE id = p_user_coupon_id;
  
  RETURN true;
END;
$$;

-- Função RPC para admin buscar cupons de um usuário
CREATE OR REPLACE FUNCTION public.get_user_coupons_admin(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  coupon_id UUID,
  code TEXT,
  description TEXT,
  discount_percent NUMERIC,
  assigned_at TIMESTAMPTZ,
  is_used BOOLEAN,
  used_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.id,
    uc.coupon_id,
    c.code,
    c.description,
    c.discount_percent,
    uc.assigned_at,
    uc.is_used,
    uc.used_at
  FROM user_coupons uc
  JOIN coupons c ON c.id = uc.coupon_id
  WHERE uc.user_id = p_user_id
  ORDER BY uc.assigned_at DESC;
END;
$$;

-- Função para atribuir cupom a usuário (admin only)
CREATE OR REPLACE FUNCTION public.assign_coupon_to_user(p_user_id UUID, p_coupon_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO user_coupons (user_id, coupon_id, assigned_by)
  VALUES (p_user_id, p_coupon_id, auth.uid())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Criar alguns cupons de exemplo
INSERT INTO coupons (code, description, discount_percent) VALUES
('BEMVINDO10', 'Desconto de boas vindas', 10),
('VIP15', 'Desconto VIP', 15),
('FIDELIDADE20', 'Cliente fidelidade', 20),
('ESPECIAL25', 'Promoção especial', 25),
('SUPER30', 'Super desconto', 30);