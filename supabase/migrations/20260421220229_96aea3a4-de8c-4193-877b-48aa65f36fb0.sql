-- Remove a função legacy deduct_cigarette: a RPC sell_loose_cigarette agora é a única fonte de consumo de cigarros soltos.
DROP FUNCTION IF EXISTS public.deduct_cigarette(text);