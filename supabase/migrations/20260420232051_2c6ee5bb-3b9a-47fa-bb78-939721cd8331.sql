-- ============================================================================
-- ONDA 3: Quarentena de tickets externos com falha de parsing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.external_order_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  source_filename text,
  raw_text text NOT NULL,
  failure_reason text NOT NULL,
  failure_details jsonb,
  parsed_summary jsonb,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quarantine_unresolved
  ON public.external_order_quarantine (created_at DESC)
  WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_quarantine_platform
  ON public.external_order_quarantine (platform, created_at DESC);

ALTER TABLE public.external_order_quarantine ENABLE ROW LEVEL SECURITY;

-- Admin pode ver tudo
CREATE POLICY "Admin vê quarentena"
  ON public.external_order_quarantine
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin pode atualizar (marcar resolvido)
CREATE POLICY "Admin resolve quarentena"
  ON public.external_order_quarantine
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Admin pode deletar
CREATE POLICY "Admin remove quarentena"
  ON public.external_order_quarantine
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role manage all (para edge function inserir)
CREATE POLICY "Service role gerencia quarentena"
  ON public.external_order_quarantine
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);