CREATE OR REPLACE FUNCTION public.deduct_stock_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_prepared boolean;
  v_product_type text;
  v_current integer;
BEGIN
  -- Itens de wizard (drinks/copão/caipi montados) descontam doses/ingredientes por fluxos próprios
  IF COALESCE(NEW.is_wizard_item, false) THEN
    RETURN NEW;
  END IF;

  -- Sem produto vinculado: nada a decrementar
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.quantity, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(stock, 0), COALESCE(is_prepared, false), COALESCE(product_type, '')
    INTO v_current, v_is_prepared, v_product_type
  FROM public.products
  WHERE id = NEW.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Produtos preparados em geral (drinks feitos por receita) não baixam estoque direto.
  -- SALGADOS são preparados/aquecidos, mas são itens físicos de estoque e devem baixar normalmente.
  IF v_is_prepared AND v_product_type <> 'salgado' THEN
    RETURN NEW;
  END IF;

  UPDATE public.products
  SET stock = GREATEST(0, v_current - NEW.quantity)
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$function$;