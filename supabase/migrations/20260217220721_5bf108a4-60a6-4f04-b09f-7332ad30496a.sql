
-- Create platform_sales table
CREATE TABLE public.platform_sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL, -- 'ifood', '99food', 'keeta', 'outro'
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  salesperson TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_sales ENABLE ROW LEVEL SECURITY;

-- Staff can manage platform sales
CREATE POLICY "Staff pode gerenciar vendas plataformas"
ON public.platform_sales
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode ver vendas plataformas"
ON public.platform_sales
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- RPC to create platform sale and deduct stock
CREATE OR REPLACE FUNCTION public.create_platform_sale(
  p_platform TEXT,
  p_product_id UUID,
  p_product_name TEXT,
  p_quantity INTEGER,
  p_unit_price NUMERIC,
  p_total_price NUMERIC,
  p_notes TEXT DEFAULT NULL,
  p_salesperson TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_stock INTEGER;
  v_is_prepared BOOLEAN;
BEGIN
  -- Check stock
  SELECT stock, is_prepared INTO v_stock, v_is_prepared FROM products WHERE id = p_product_id;
  
  -- Deduct stock only if not prepared
  IF NOT COALESCE(v_is_prepared, false) THEN
    IF v_stock < p_quantity THEN
      RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', v_stock;
    END IF;
    UPDATE products SET stock = stock - p_quantity WHERE id = p_product_id;
  END IF;
  
  -- Insert sale record
  INSERT INTO platform_sales (platform, product_id, product_name, quantity, unit_price, total_price, notes, salesperson)
  VALUES (p_platform, p_product_id, p_product_name, p_quantity, p_unit_price, p_total_price, p_notes, p_salesperson)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- RPC to delete platform sale and restore stock
CREATE OR REPLACE FUNCTION public.delete_platform_sale(p_id UUID) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_id UUID;
  v_quantity INTEGER;
  v_is_prepared BOOLEAN;
BEGIN
  SELECT product_id, quantity INTO v_product_id, v_quantity FROM platform_sales WHERE id = p_id;
  
  IF v_product_id IS NOT NULL THEN
    SELECT is_prepared INTO v_is_prepared FROM products WHERE id = v_product_id;
    IF NOT COALESCE(v_is_prepared, false) THEN
      UPDATE products SET stock = stock + v_quantity WHERE id = v_product_id;
    END IF;
  END IF;
  
  DELETE FROM platform_sales WHERE id = p_id;
END;
$$;

-- RPC to get platform sales with filters
CREATE OR REPLACE FUNCTION public.get_platform_sales(
  p_platform TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF platform_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM platform_sales
  WHERE (p_platform IS NULL OR platform = p_platform)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  ORDER BY created_at DESC
  LIMIT 500;
END;
$$;
