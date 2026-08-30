-- 1) Cache de geocoding (endereço normalizado -> lat/lng + componentes)
CREATE TABLE IF NOT EXISTS public.geocoding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  query_type text NOT NULL CHECK (query_type IN ('forward', 'reverse')),
  formatted_address text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  street text,
  number text,
  neighborhood text,
  city text,
  state text,
  zip_code text,
  components jsonb,
  hit_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geocoding_cache_key ON public.geocoding_cache(cache_key);

ALTER TABLE public.geocoding_cache ENABLE ROW LEVEL SECURITY;

-- Leitura pública (é apenas dados de mapa)
CREATE POLICY "Geocoding cache is public for reading"
  ON public.geocoding_cache FOR SELECT
  USING (true);

-- Inserção pública (escrita feita por edge function)
CREATE POLICY "Geocoding cache allows public inserts"
  ON public.geocoding_cache FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Geocoding cache allows public updates"
  ON public.geocoding_cache FOR UPDATE
  USING (true);

-- 2) Colunas para cachear rota do motoboy em orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS route_polyline text,
  ADD COLUMN IF NOT EXISTS route_origin_lat numeric,
  ADD COLUMN IF NOT EXISTS route_origin_lng numeric,
  ADD COLUMN IF NOT EXISTS route_distance_meters integer,
  ADD COLUMN IF NOT EXISTS route_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS route_calculated_at timestamp with time zone;