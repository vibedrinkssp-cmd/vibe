-- ============================================================
-- 1) Drop overloads conflitantes de create_counter_order_with_items
-- ============================================================
-- Versão antiga sem client_request_id e com customer_name 'Balcão'
DROP FUNCTION IF EXISTS public.create_counter_order_with_items(
  numeric, numeric, numeric, numeric, payment_method, text, uuid, numeric, text, text, text
);
-- Versão antiga com assinatura diferente (status 'accepted' direto)
DROP FUNCTION IF EXISTS public.create_counter_order_with_items(
  numeric, numeric, payment_method, text, uuid, text, numeric, text, numeric, numeric, text
);
-- Mantém apenas a versão com p_client_request_id (a canônica)

-- ============================================================
-- 2) Drop trigger duplicado de recompute (mantém recalc_order_subtotal)
-- ============================================================
DROP TRIGGER IF EXISTS trg_order_items_recompute ON public.order_items;

-- ============================================================
-- 3) Reforça deduct_product_stock com FOR UPDATE (lock de linha)
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_product_stock(p_product_id uuid, p_quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current integer;
  v_is_prepared boolean;
BEGIN
  IF p_product_id IS NULL OR COALESCE(p_quantity, 0) <= 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(stock, 0), COALESCE(is_prepared, false)
    INTO v_current, v_is_prepared
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- produto não existe, ignora silenciosamente (item ad-hoc)
  END IF;

  -- Produtos preparados têm estoque infinito (não decrementam)
  IF v_is_prepared THEN
    RETURN;
  END IF;

  UPDATE public.products
  SET stock = GREATEST(0, v_current - p_quantity)
  WHERE id = p_product_id;
END;
$function$;

-- ============================================================
-- 4) Função-trigger: decremento automático e atômico no insert de order_items
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_stock_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_prepared boolean;
  v_current integer;
BEGIN
  -- Pula itens de wizard (drinks/copão/caipi montados): esses decrementam doses via RPCs próprias
  IF COALESCE(NEW.is_wizard_item, false) THEN
    RETURN NEW;
  END IF;

  -- Sem product_id vinculado (item ad-hoc): nada a decrementar
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Quantidade inválida: nada a fazer
  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Lock de linha para evitar race em vendas simultâneas
  SELECT COALESCE(stock, 0), COALESCE(is_prepared, false)
    INTO v_current, v_is_prepared
  FROM public.products
  WHERE id = NEW.product_id
  FOR UPDATE;

  -- Produto não encontrado ou preparado: não decrementa
  IF NOT FOUND OR v_is_prepared THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
  SET stock = GREATEST(0, v_current - NEW.quantity)
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 5) Cria o trigger AFTER INSERT em order_items
-- ============================================================
DROP TRIGGER IF EXISTS trg_deduct_stock_on_order_item ON public.order_items;
CREATE TRIGGER trg_deduct_stock_on_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_stock_on_order_item();

-- ============================================================
-- 6) Auditoria
-- ============================================================
INSERT INTO public.cash_register_audit (action, responsible, notes)
VALUES (
  'fix_atomic_stock_deduction',
  'SISTEMA',
  'Corrigido: trigger atômico de decremento de estoque em order_items, drop de 2 overloads conflitantes de create_counter_order_with_items, drop do trigger duplicado trg_order_items_recompute, FOR UPDATE em deduct_product_stock.'
);