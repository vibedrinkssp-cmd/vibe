-- ============================================================
-- Cupons gerais (PDV / Totem) — não atribuídos a clientes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_coupons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL,
  description text,
  discount_percent numeric NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  category_ids uuid[] NOT NULL DEFAULT '{}', -- vazio = todas as categorias
  include_drinks boolean NOT NULL DEFAULT false, -- aplica em itens "monte seu drink"
  max_uses integer, -- null = ilimitado
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_coupons_code_unique ON public.pos_coupons (upper(code));

GRANT SELECT ON public.pos_coupons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_coupons TO authenticated;
GRANT ALL ON public.pos_coupons TO service_role;

ALTER TABLE public.pos_coupons ENABLE ROW LEVEL SECURITY;

-- Admin gerencia tudo
CREATE POLICY "Admin gerencia pos_coupons"
  ON public.pos_coupons FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Leitura pública (PDV/Totem rodam anon) — apenas leitura, redenção via RPC
CREATE POLICY "Leitura publica de cupons ativos"
  ON public.pos_coupons FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- trigger updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_pos_coupons_updated_at ON public.pos_coupons;
CREATE TRIGGER update_pos_coupons_updated_at
  BEFORE UPDATE ON public.pos_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- normaliza code em maiúsculas
CREATE OR REPLACE FUNCTION public.normalize_pos_coupon_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.code = upper(trim(NEW.code));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS normalize_pos_coupons_code ON public.pos_coupons;
CREATE TRIGGER normalize_pos_coupons_code
  BEFORE INSERT OR UPDATE ON public.pos_coupons
  FOR EACH ROW EXECUTE FUNCTION public.normalize_pos_coupon_code();

-- ============================================================
-- RPC: validar cupom (sem consumir) — retorna dados se válido
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_pos_coupon(p_code text)
RETURNS TABLE (
  id uuid,
  code text,
  description text,
  discount_percent numeric,
  category_ids uuid[],
  include_drinks boolean,
  valid boolean,
  reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.pos_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.pos_coupons WHERE upper(code) = upper(trim(p_code)) LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, p_code, NULL::text, NULL::numeric, NULL::uuid[], NULL::boolean, false, 'Cupom não encontrado';
    RETURN;
  END IF;

  IF NOT c.is_active THEN
    RETURN QUERY SELECT c.id, c.code, c.description, c.discount_percent, c.category_ids, c.include_drinks, false, 'Cupom inativo';
    RETURN;
  END IF;

  IF now() < c.valid_from THEN
    RETURN QUERY SELECT c.id, c.code, c.description, c.discount_percent, c.category_ids, c.include_drinks, false, 'Cupom ainda não iniciou';
    RETURN;
  END IF;

  IF now() > c.valid_until THEN
    RETURN QUERY SELECT c.id, c.code, c.description, c.discount_percent, c.category_ids, c.include_drinks, false, 'Cupom expirado';
    RETURN;
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RETURN QUERY SELECT c.id, c.code, c.description, c.discount_percent, c.category_ids, c.include_drinks, false, 'Limite de usos atingido';
    RETURN;
  END IF;

  RETURN QUERY SELECT c.id, c.code, c.description, c.discount_percent, c.category_ids, c.include_drinks, true, NULL::text;
END;
$$;

-- ============================================================
-- RPC: redimir cupom (consome 1 uso, atômico via FOR UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_pos_coupon(p_coupon_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.pos_coupons%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.pos_coupons WHERE id = p_coupon_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;

  IF NOT c.is_active THEN
    RAISE EXCEPTION 'Cupom inativo';
  END IF;

  IF now() < c.valid_from OR now() > c.valid_until THEN
    RAISE EXCEPTION 'Cupom fora do período de validade';
  END IF;

  IF c.max_uses IS NOT NULL AND c.used_count >= c.max_uses THEN
    RAISE EXCEPTION 'Limite de usos atingido';
  END IF;

  UPDATE public.pos_coupons SET used_count = used_count + 1 WHERE id = p_coupon_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_pos_coupon(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_pos_coupon(uuid) TO anon, authenticated, service_role;