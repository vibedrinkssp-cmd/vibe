-- use_coupon_admin (cupom pessoal do cliente, usado no Checkout do site) lia a
-- linha sem FOR UPDATE antes de checar is_used, diferente de redeem_pos_coupon
-- (cupom do PDV), que já trava a linha corretamente. Dois pedidos quase
-- simultâneos com o mesmo cupom de cliente podiam ambos passar a checagem
-- antes de qualquer UPDATE confirmar is_used=true, concedendo o desconto duas
-- vezes. Alinha com o mesmo padrão de redeem_pos_coupon.
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
  SELECT * INTO v_user_coupon FROM user_coupons WHERE id = p_user_coupon_id FOR UPDATE;

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
