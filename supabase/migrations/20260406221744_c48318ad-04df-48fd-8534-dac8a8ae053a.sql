
CREATE OR REPLACE FUNCTION public.uppercase_product_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.name = UPPER(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_uppercase_product_name
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.uppercase_product_name();
