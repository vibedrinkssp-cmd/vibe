-- 1. Bloquear delete_order quando há pagamento PIX confirmado (mp_payment_id presente e status != cancelled)
CREATE OR REPLACE FUNCTION public.delete_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_recipe RECORD;
  v_needed integer;
  v_ingredient_product_id uuid;
  v_ingredient_name text;
  v_bottle RECORD;
  v_mp_payment_id text;
  v_status order_status;
BEGIN
  -- GUARDA: nunca deletar pedido com PIX pago/confirmado
  SELECT mp_payment_id, status INTO v_mp_payment_id, v_status
  FROM public.orders
  WHERE id = p_order_id;

  IF v_mp_payment_id IS NOT NULL AND length(trim(v_mp_payment_id)) > 0 AND v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'PEDIDO_PIX_PROTEGIDO: Pedido % possui pagamento PIX (MP #%) e não pode ser excluído. Cancele primeiro se necessário.', p_order_id, v_mp_payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Loop through all order items to restore stock
  FOR v_item IN
    SELECT oi.product_id, oi.product_name, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    -- 1) Restore product stock
    IF v_item.product_id IS NOT NULL THEN
      UPDATE public.products
      SET stock = COALESCE(stock, 0) + v_item.quantity
      WHERE id = v_item.product_id;
    END IF;

    -- 2) Restore special drink doses (via recipes)
    IF v_item.product_id IS NOT NULL THEN
      FOR v_recipe IN
        SELECT r.ingredient_type, r.ingredient_product_id, r.bottle_product_name, r.quantity AS recipe_qty
        FROM public.special_drink_recipes r
        WHERE r.product_id = v_item.product_id
      LOOP
        v_needed := v_recipe.recipe_qty * v_item.quantity;
        v_ingredient_product_id := v_recipe.ingredient_product_id;
        v_ingredient_name := v_recipe.bottle_product_name;

        IF v_recipe.ingredient_type = 'dose' THEN
          IF v_ingredient_product_id IS NULL AND v_ingredient_name IS NOT NULL THEN
            SELECT p.id INTO v_ingredient_product_id
            FROM public.products p
            WHERE p.name ILIKE v_ingredient_name
            ORDER BY p.is_active DESC, p.created_at DESC
            LIMIT 1;
          END IF;

          IF v_ingredient_product_id IS NOT NULL THEN
            FOR v_bottle IN
              SELECT ob.id, ob.remaining_doses, ob.total_doses
              FROM public.open_bottles ob
              WHERE ob.product_id = v_ingredient_product_id
              ORDER BY ob.is_empty ASC, ob.opened_at DESC
              FOR UPDATE
            LOOP
              EXIT WHEN v_needed <= 0;
              DECLARE
                v_can_add integer;
              BEGIN
                v_can_add := LEAST(v_needed, v_bottle.total_doses - v_bottle.remaining_doses);
                IF v_can_add > 0 THEN
                  UPDATE public.open_bottles
                  SET remaining_doses = remaining_doses + v_can_add,
                      is_empty = false,
                      emptied_at = NULL
                  WHERE id = v_bottle.id;
                  v_needed := v_needed - v_can_add;
                END IF;
              END;
            END LOOP;
          END IF;

        ELSIF v_recipe.ingredient_type = 'product' THEN
          IF v_ingredient_product_id IS NOT NULL THEN
            UPDATE public.products
            SET stock = COALESCE(stock, 0) + v_needed
            WHERE id = v_ingredient_product_id;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Delete order items first (FK)
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  -- Then delete the order
  DELETE FROM public.orders WHERE id = p_order_id;
END;
$function$;

-- 2. Índice para busca rápida por mp_payment_id
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON public.orders(mp_payment_id) WHERE mp_payment_id IS NOT NULL;

-- 3. Tabela de auditoria de PIX gerados (rede de segurança para pagamentos órfãos)
CREATE TABLE IF NOT EXISTS public.pix_payment_audit (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mp_payment_id text,
  external_reference text,
  amount numeric NOT NULL,
  description text,
  payer_email text,
  order_id uuid,
  status text NOT NULL DEFAULT 'created',
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_pix_audit_mp_payment ON public.pix_payment_audit(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pix_audit_external_ref ON public.pix_payment_audit(external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pix_audit_created_at ON public.pix_payment_audit(created_at DESC);

ALTER TABLE public.pix_payment_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin vê pix_payment_audit"
  ON public.pix_payment_audit FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role gerencia pix_payment_audit"
  ON public.pix_payment_audit FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin atualiza pix_payment_audit"
  ON public.pix_payment_audit FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));