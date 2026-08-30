-- 1) Remover FUSION do sistema (desativar todas variantes)
UPDATE public.products
SET is_active = false
WHERE name ILIKE '%fusion%';

-- 2) Marcar como vazias as garrafas abertas do Fusion (se existirem)
UPDATE public.open_bottles
SET is_empty = true, emptied_at = now()
WHERE product_id IN (SELECT id FROM public.products WHERE name ILIKE '%fusion%')
  AND is_empty = false;

-- 3) Marcar BALY TROPICAL aberta como vazia (excluída do copão)
UPDATE public.open_bottles
SET is_empty = true, emptied_at = now()
WHERE product_id = 'de85bdfc-09bd-46b8-82f7-df933da1a44f'
  AND is_empty = false;

-- 4) Forçar dose_price = 0 em TODAS as garrafas abertas de energéticos (Big Boss tinha 2,00)
UPDATE public.open_bottles ob
SET dose_price = 0
FROM public.products p
WHERE ob.product_id = p.id
  AND p.product_type = 'energetico'
  AND ob.dose_price <> 0;

-- 5) Abrir BALY 2L TRADICIONAL (5 doses de 400ml, dose grátis) se ainda não aberta
INSERT INTO public.open_bottles (product_id, product_name, total_ml, ml_per_dose, total_doses, remaining_doses, dose_price, opened_by, notes)
SELECT 'e8aec179-8f60-4eca-a3e8-1de9e6935f05', 'BALY 2 LITROS TRADICIONAL', 2000, 400, 5, 5, 0, 'sistema', 'Abertura automática para Copão'
WHERE EXISTS (SELECT 1 FROM public.products WHERE id = 'e8aec179-8f60-4eca-a3e8-1de9e6935f05')
  AND NOT EXISTS (
    SELECT 1 FROM public.open_bottles
    WHERE product_id = 'e8aec179-8f60-4eca-a3e8-1de9e6935f05' AND is_empty = false
  );

-- 6) Trigger: garante que toda garrafa aberta de energético tenha dose_price = 0
CREATE OR REPLACE FUNCTION public.enforce_energy_drink_free_dose()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
BEGIN
  SELECT product_type INTO v_type FROM public.products WHERE id = NEW.product_id;
  IF v_type = 'energetico' THEN
    NEW.dose_price := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_energy_drink_free_dose ON public.open_bottles;
CREATE TRIGGER trg_enforce_energy_drink_free_dose
BEFORE INSERT OR UPDATE ON public.open_bottles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_energy_drink_free_dose();