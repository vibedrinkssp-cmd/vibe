DROP POLICY IF EXISTS "Geocoding cache allows public inserts" ON public.geocoding_cache;
DROP POLICY IF EXISTS "Geocoding cache allows public updates" ON public.geocoding_cache;

-- Apenas service_role pode escrever (edge function usa service role key)
CREATE POLICY "Geocoding cache writes via service role only"
  ON public.geocoding_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Geocoding cache updates via service role only"
  ON public.geocoding_cache FOR UPDATE
  TO service_role
  USING (true);