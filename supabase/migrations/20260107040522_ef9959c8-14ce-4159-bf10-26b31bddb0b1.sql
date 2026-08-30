-- Tabela para garrafas abertas
CREATE TABLE public.open_bottles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  total_ml INTEGER NOT NULL,
  ml_per_dose INTEGER NOT NULL,
  total_doses INTEGER NOT NULL,
  remaining_doses INTEGER NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  opened_by TEXT,
  is_empty BOOLEAN NOT NULL DEFAULT false,
  emptied_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.open_bottles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Staff pode ver garrafas" 
ON public.open_bottles 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

CREATE POLICY "Staff pode gerenciar garrafas" 
ON public.open_bottles 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.open_bottles;

-- RPC para abrir garrafa (decrementa estoque automaticamente)
CREATE OR REPLACE FUNCTION public.open_bottle(
  p_product_id UUID,
  p_total_ml INTEGER,
  p_ml_per_dose INTEGER,
  p_opened_by TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_name TEXT;
  v_total_doses INTEGER;
  v_bottle_id UUID;
BEGIN
  -- Get product name
  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  
  -- Calculate total doses
  v_total_doses := p_total_ml / p_ml_per_dose;
  
  -- Decrement stock
  UPDATE products SET stock = COALESCE(stock, 0) - 1 WHERE id = p_product_id;
  
  -- Create open bottle
  INSERT INTO open_bottles (product_id, product_name, total_ml, ml_per_dose, total_doses, remaining_doses, opened_by, notes)
  VALUES (p_product_id, v_product_name, p_total_ml, p_ml_per_dose, v_total_doses, v_total_doses, p_opened_by, p_notes)
  RETURNING id INTO v_bottle_id;
  
  RETURN v_bottle_id;
END;
$$;

-- RPC para usar dose
CREATE OR REPLACE FUNCTION public.use_bottle_dose(
  p_bottle_id UUID,
  p_doses INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Decrement doses
  UPDATE open_bottles 
  SET remaining_doses = remaining_doses - p_doses,
      is_empty = CASE WHEN remaining_doses - p_doses <= 0 THEN true ELSE false END,
      emptied_at = CASE WHEN remaining_doses - p_doses <= 0 THEN now() ELSE NULL END
  WHERE id = p_bottle_id AND NOT is_empty
  RETURNING remaining_doses INTO v_remaining;
  
  RETURN COALESCE(v_remaining, 0);
END;
$$;

-- RPC para listar todas garrafas abertas
CREATE OR REPLACE FUNCTION public.get_open_bottles()
RETURNS SETOF open_bottles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM open_bottles ORDER BY is_empty ASC, opened_at DESC;
$$;