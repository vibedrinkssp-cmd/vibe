-- =====================================================================
-- Cupons simplificados por cliente: criar (R$ ou %) e renovar (editando)
-- Mantém tabelas existentes; apenas adiciona RPCs.
-- =====================================================================

-- 1) Criar cupom simples e atribuir direto ao cliente
-- Tipos suportados:
--   'percent'      -> usa p_discount_percent (1..100)
--   'fixed_amount' -> usa p_discount_value (R$); discount_percent gravado como 0.01 (placeholder válido)
CREATE OR REPLACE FUNCTION public.create_simple_coupon_admin(
  p_admin_user_id uuid,
  p_target_user_id uuid,
  p_code text,
  p_discount_type text,           -- 'percent' | 'fixed_amount'
  p_discount_value numeric         -- % (1..100) ou R$ (>0)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id uuid;
  v_code text;
  v_final_code text;
  v_suffix int := 0;
  v_percent numeric;
  v_max numeric;
  v_type text;
BEGIN
  -- Auth: apenas admin
  IF NOT has_role(p_admin_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Cliente é obrigatório';
  END IF;

  v_code := upper(btrim(coalesce(p_code, '')));
  IF v_code = '' THEN
    RAISE EXCEPTION 'Nome do cupom é obrigatório';
  END IF;

  IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Valor do desconto inválido';
  END IF;

  IF p_discount_type = 'percent' THEN
    IF p_discount_value > 100 THEN
      RAISE EXCEPTION 'Percentual deve ser entre 1 e 100';
    END IF;
    v_type := 'percent';
    v_percent := p_discount_value;
    v_max := NULL;
  ELSIF p_discount_type = 'fixed_amount' THEN
    v_type := 'fixed_amount';
    v_percent := 0.01; -- placeholder para passar no CHECK > 0
    v_max := p_discount_value;
  ELSE
    RAISE EXCEPTION 'Tipo de cupom inválido';
  END IF;

  -- Garantir UNIQUE em coupons.code
  v_final_code := v_code;
  WHILE EXISTS (SELECT 1 FROM public.coupons WHERE code = v_final_code) LOOP
    v_suffix := v_suffix + 1;
    v_final_code := v_code || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.coupons (
    code, description, discount_percent, coupon_type,
    max_discount_value, is_template, is_active,
    assign_to_all, created_by, min_quantity
  ) VALUES (
    v_final_code,
    'Cupom personalizado',
    v_percent,
    v_type,
    v_max,
    false,   -- não é template
    true,
    false,
    p_admin_user_id,
    1
  )
  RETURNING id INTO v_coupon_id;

  INSERT INTO public.user_coupons (user_id, coupon_id, assigned_by, is_used)
  VALUES (p_target_user_id, v_coupon_id, p_admin_user_id, false);

  RETURN v_coupon_id;
END;
$$;

-- 2) Renovar cupom usado (editando): atualiza coupons base com novo nome/valor
--    e marca o user_coupon como não-usado novamente.
CREATE OR REPLACE FUNCTION public.renew_user_coupon_admin(
  p_admin_user_id uuid,
  p_user_coupon_id uuid,
  p_code text,
  p_discount_type text,
  p_discount_value numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon_id uuid;
  v_code text;
  v_final_code text;
  v_suffix int := 0;
  v_percent numeric;
  v_max numeric;
  v_type text;
BEGIN
  IF NOT has_role(p_admin_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: somente admin';
  END IF;

  SELECT coupon_id INTO v_coupon_id
  FROM public.user_coupons
  WHERE id = p_user_coupon_id;

  IF v_coupon_id IS NULL THEN
    RAISE EXCEPTION 'Cupom do cliente não encontrado';
  END IF;

  v_code := upper(btrim(coalesce(p_code, '')));
  IF v_code = '' THEN
    RAISE EXCEPTION 'Nome do cupom é obrigatório';
  END IF;

  IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Valor do desconto inválido';
  END IF;

  IF p_discount_type = 'percent' THEN
    IF p_discount_value > 100 THEN
      RAISE EXCEPTION 'Percentual deve ser entre 1 e 100';
    END IF;
    v_type := 'percent';
    v_percent := p_discount_value;
    v_max := NULL;
  ELSIF p_discount_type = 'fixed_amount' THEN
    v_type := 'fixed_amount';
    v_percent := 0.01;
    v_max := p_discount_value;
  ELSE
    RAISE EXCEPTION 'Tipo de cupom inválido';
  END IF;

  -- Garantir UNIQUE (excluindo o próprio)
  v_final_code := v_code;
  WHILE EXISTS (
    SELECT 1 FROM public.coupons WHERE code = v_final_code AND id <> v_coupon_id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_final_code := v_code || '-' || v_suffix::text;
  END LOOP;

  UPDATE public.coupons
  SET code = v_final_code,
      coupon_type = v_type,
      discount_percent = v_percent,
      max_discount_value = v_max,
      is_active = true,
      expires_at = NULL
  WHERE id = v_coupon_id;

  UPDATE public.user_coupons
  SET is_used = false,
      used_at = NULL,
      used_in_order_id = NULL,
      assigned_at = now()
  WHERE id = p_user_coupon_id;

  RETURN v_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_simple_coupon_admin(uuid, uuid, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.renew_user_coupon_admin(uuid, uuid, text, text, numeric) TO authenticated;