-- 1. Criar função use_coupon_admin que aceita user_id como parâmetro (para auth customizada)
CREATE OR REPLACE FUNCTION use_coupon_admin(
  p_user_id UUID,
  p_user_coupon_id UUID,
  p_order_id UUID
) RETURNS BOOLEAN
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
  
  IF v_user_coupon.user_id != p_user_id THEN
    RAISE EXCEPTION 'Cupom não pertence a este usuário';
  END IF;
  
  UPDATE user_coupons
  SET is_used = true, used_at = now(), used_in_order_id = p_order_id
  WHERE id = p_user_coupon_id;
  
  RETURN true;
END;
$$;

-- 2. Criar função delete_user_coupon_admin com validação de admin
CREATE OR REPLACE FUNCTION delete_user_coupon_admin(
  p_admin_user_id UUID,
  p_user_coupon_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_used BOOLEAN;
BEGIN
  -- Verificar se é admin
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = p_admin_user_id AND role = 'admin'
  ) INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Apenas administradores podem remover cupons';
  END IF;

  -- Verificar se cupom já foi usado
  SELECT is_used INTO v_is_used FROM user_coupons WHERE id = p_user_coupon_id;
  
  IF v_is_used THEN
    RAISE EXCEPTION 'Não é possível remover cupom já utilizado';
  END IF;

  DELETE FROM user_coupons WHERE id = p_user_coupon_id;
  RETURN TRUE;
END;
$$;

-- 3. Habilitar Realtime para tabelas de cupons
ALTER PUBLICATION supabase_realtime ADD TABLE user_coupons;
ALTER PUBLICATION supabase_realtime ADD TABLE coupons;

-- 4. Conceder permissões de execução
GRANT EXECUTE ON FUNCTION use_coupon_admin(UUID, UUID, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION delete_user_coupon_admin(UUID, UUID) TO authenticated, anon;