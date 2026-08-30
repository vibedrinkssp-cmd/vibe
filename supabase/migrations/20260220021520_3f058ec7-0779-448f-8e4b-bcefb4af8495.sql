
-- Add dose_price column to open_bottles (admin sets price per dose)
ALTER TABLE public.open_bottles ADD COLUMN IF NOT EXISTS dose_price numeric NOT NULL DEFAULT 0;

-- RPC for customers: returns available bottles (with doses > 0) without exposing internal stock info
CREATE OR REPLACE FUNCTION public.get_available_bottles_for_assembly()
RETURNS TABLE(
  bottle_id uuid,
  product_id uuid,
  product_name text,
  dose_price numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ob.id AS bottle_id,
    ob.product_id,
    ob.product_name,
    ob.dose_price
  FROM open_bottles ob
  WHERE ob.is_empty = false 
    AND ob.remaining_doses > 0
    AND ob.dose_price > 0
  ORDER BY ob.product_name;
END;
$$;

-- RPC to deduct doses after order (called from kitchen/staff)
-- Already exists: deduct_bottle_doses
