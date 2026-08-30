
-- Fix search_path on trigger functions
CREATE OR REPLACE FUNCTION public.open_bottles_uppercase_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.product_name := UPPER(NEW.product_name);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.uppercase_category_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.name := UPPER(NEW.name);
  RETURN NEW;
END;
$function$;
