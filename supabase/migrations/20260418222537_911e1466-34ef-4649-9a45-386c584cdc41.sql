CREATE OR REPLACE FUNCTION public.increment_geocoding_cache_hit(p_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.geocoding_cache
  SET hit_count = hit_count + 1,
      last_used_at = now()
  WHERE cache_key = p_key;
$$;