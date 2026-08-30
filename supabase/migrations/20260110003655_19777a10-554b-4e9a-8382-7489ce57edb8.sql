-- Add barcode column to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create unique index on barcode (allowing nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode) WHERE barcode IS NOT NULL;

-- Create function to update product barcode
CREATE OR REPLACE FUNCTION public.update_product_barcode(p_id TEXT, p_barcode TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products SET barcode = p_barcode WHERE id = p_id::uuid;
END;
$$;

-- Create function to find product by barcode
CREATE OR REPLACE FUNCTION public.find_product_by_barcode(p_barcode TEXT)
RETURNS SETOF products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM products WHERE barcode = p_barcode AND is_active = true LIMIT 1;
END;
$$;