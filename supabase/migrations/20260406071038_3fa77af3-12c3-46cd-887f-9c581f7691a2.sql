
-- Tabela de receitas: cada drink especial pode ter múltiplos ingredientes
CREATE TABLE public.special_drink_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ingredient_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  bottle_product_name TEXT,
  ingredient_type TEXT NOT NULL DEFAULT 'dose',
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.special_drink_recipes ENABLE ROW LEVEL SECURITY;

-- Admin gerencia receitas
CREATE POLICY "Admin gerencia receitas" ON public.special_drink_recipes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Leitura pública (necessário para modal de drinks especiais)
CREATE POLICY "Receitas públicas para leitura" ON public.special_drink_recipes
  FOR SELECT TO public
  USING (true);

-- RPC para deduzir estoque ao vender drink especial
CREATE OR REPLACE FUNCTION public.deduct_special_drink_stock(p_product_id UUID, p_quantity INTEGER DEFAULT 1)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipe RECORD;
  bottle RECORD;
  doses_needed INTEGER;
  remaining INTEGER;
BEGIN
  FOR recipe IN
    SELECT * FROM special_drink_recipes WHERE product_id = p_product_id
  LOOP
    IF recipe.ingredient_type = 'dose' THEN
      -- Deduzir doses das garrafas abertas
      doses_needed := recipe.quantity * p_quantity;
      FOR bottle IN
        SELECT * FROM open_bottles
        WHERE product_name ILIKE '%' || recipe.bottle_product_name || '%'
          AND is_empty = false
          AND remaining_doses > 0
        ORDER BY opened_at ASC
      LOOP
        IF doses_needed <= 0 THEN EXIT; END IF;
        IF bottle.remaining_doses >= doses_needed THEN
          UPDATE open_bottles SET remaining_doses = remaining_doses - doses_needed,
            is_empty = CASE WHEN remaining_doses - doses_needed <= 0 THEN true ELSE false END,
            emptied_at = CASE WHEN remaining_doses - doses_needed <= 0 THEN now() ELSE emptied_at END
          WHERE id = bottle.id;
          doses_needed := 0;
        ELSE
          doses_needed := doses_needed - bottle.remaining_doses;
          UPDATE open_bottles SET remaining_doses = 0, is_empty = true, emptied_at = now()
          WHERE id = bottle.id;
        END IF;
      END LOOP;
    ELSIF recipe.ingredient_type = 'product' THEN
      -- Deduzir do estoque normal de produtos (energéticos etc)
      IF recipe.ingredient_product_id IS NOT NULL THEN
        UPDATE products SET stock = GREATEST(0, stock - (recipe.quantity * p_quantity))
        WHERE id = recipe.ingredient_product_id;
      END IF;
    END IF;
  END LOOP;
END;
$$;
