
-- Trigger function: auto-deduct cigarettes from open packs on order item insert
CREATE OR REPLACE FUNCTION public.auto_deduct_cigarette_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name text;
  v_base_name text;
  i integer;
BEGIN
  -- Get the product name from the order item
  v_product_name := UPPER(TRIM(NEW.product_name));
  
  -- Check if this is a loose cigarette (contains SOLTO, AVULSO, UNIDADE, or UND)
  IF v_product_name LIKE '%SOLTO%' OR v_product_name LIKE '%AVULSO%' 
     OR v_product_name LIKE '%UNIDADE%' OR v_product_name LIKE '% UND%' THEN
    
    -- Find the matching pack by looking for the base product name in open_packs
    -- Remove the loose indicator words to get the base cigarette brand name
    v_base_name := v_product_name;
    v_base_name := REPLACE(v_base_name, 'SOLTO', '');
    v_base_name := REPLACE(v_base_name, 'AVULSO', '');
    v_base_name := REPLACE(v_base_name, 'UNIDADE', '');
    v_base_name := REPLACE(v_base_name, 'UND', '');
    v_base_name := REPLACE(v_base_name, 'CIGARRO', '');
    v_base_name := REPLACE(v_base_name, '  ', ' ');
    v_base_name := TRIM(v_base_name);
    
    -- Deduct quantity times from the oldest open pack that matches
    FOR i IN 1..NEW.quantity LOOP
      UPDATE open_packs
      SET remaining_units = remaining_units - 1,
          is_empty = CASE WHEN remaining_units - 1 <= 0 THEN true ELSE false END,
          emptied_at = CASE WHEN remaining_units - 1 <= 0 THEN now() ELSE NULL END
      WHERE id = (
        SELECT id FROM open_packs
        WHERE is_empty = false AND remaining_units > 0
          AND UPPER(product_name) LIKE '%' || v_base_name || '%'
        ORDER BY opened_at ASC
        LIMIT 1
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_deduct_cigarette
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_deduct_cigarette_on_sale();
