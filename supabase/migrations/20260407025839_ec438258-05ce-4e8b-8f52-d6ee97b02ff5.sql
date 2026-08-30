
CREATE OR REPLACE FUNCTION public.uppercase_category_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := UPPER(TRIM(NEW.name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_uppercase_category_name ON public.categories;
CREATE TRIGGER trg_uppercase_category_name
  BEFORE INSERT OR UPDATE OF name ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.uppercase_category_name();

-- Normalize existing category names
UPDATE public.categories SET name = UPPER(TRIM(name)) WHERE name <> UPPER(TRIM(name));
