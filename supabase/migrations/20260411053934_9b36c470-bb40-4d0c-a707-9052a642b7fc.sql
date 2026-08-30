
-- Drop the version WITHOUT p_tier (10 params) to resolve ambiguity
DROP FUNCTION IF EXISTS public.update_product(uuid, text, text, uuid, numeric, numeric, numeric, integer, text, boolean);
