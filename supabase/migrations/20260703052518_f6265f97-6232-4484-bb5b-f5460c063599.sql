-- Drop the two older/shorter overloads of update_product that cause PostgREST
-- ambiguity (PGRST203) when calling with only platform fields.
DROP FUNCTION IF EXISTS public.update_product(
  uuid, text, text, uuid, numeric, numeric, numeric, integer, text, boolean, product_tier
);
DROP FUNCTION IF EXISTS public.update_product(
  uuid, text, text, uuid, numeric, numeric, numeric, integer, text, boolean, product_tier, boolean, boolean
);