-- Doses são debitadas da garrafa aberta no momento em que o drink é MONTADO
-- (dentro do wizard), não quando o pedido é de fato finalizado. Até agora,
-- remover o drink do carrinho antes de comprar (ou o cliente simplesmente
-- desistir) não devolvia dose nenhuma — o controle de garrafa ficava
-- descontado sem venda nenhuma ter acontecido. Esta RPC espelha
-- deduct_bottle_doses para permitir o estorno nesses casos.
CREATE OR REPLACE FUNCTION public.return_bottle_doses(
  p_bottle_id UUID,
  p_doses_returned INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
  v_total INTEGER;
  v_new_remaining INTEGER;
BEGIN
  SELECT remaining_doses, total_doses INTO v_remaining, v_total
  FROM open_bottles WHERE id = p_bottle_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garrafa não encontrada';
  END IF;

  -- Nunca devolve além do total da garrafa (evita duplo-estorno inflar o controle).
  v_new_remaining := LEAST(v_total, v_remaining + p_doses_returned);

  UPDATE open_bottles
  SET remaining_doses = v_new_remaining,
      is_empty = (v_new_remaining <= 0),
      emptied_at = CASE WHEN v_new_remaining > 0 THEN NULL ELSE emptied_at END
  WHERE id = p_bottle_id;
END;
$$;
