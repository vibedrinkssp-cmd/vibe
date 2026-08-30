
-- Update existing open_bottles to uppercase
UPDATE public.open_bottles SET product_name = UPPER(product_name) WHERE product_name != UPPER(product_name);

-- Create trigger to enforce uppercase on open_bottles.product_name
CREATE OR REPLACE FUNCTION public.open_bottles_uppercase_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.product_name := UPPER(NEW.product_name);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_open_bottles_uppercase
  BEFORE INSERT OR UPDATE ON public.open_bottles
  FOR EACH ROW
  EXECUTE FUNCTION public.open_bottles_uppercase_name();
