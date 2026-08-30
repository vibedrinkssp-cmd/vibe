-- ============================================
-- Integração iFood OFICIAL (modo TESTE)
-- ============================================

-- 1) Tabela de configuração (1 linha)
CREATE TABLE IF NOT EXISTS public.ifood_test_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  last_poll_event_count integer DEFAULT 0,
  last_error text,
  last_error_at timestamptz,
  cached_token text,
  cached_token_expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ifood_test_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia ifood_test_config"
  ON public.ifood_test_config
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff vê ifood_test_config"
  ON public.ifood_test_config
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pdv'::app_role)
    OR has_role(auth.uid(), 'kitchen'::app_role)
  );

-- 2) Auditoria de eventos recebidos (idempotência + debug)
CREATE TABLE IF NOT EXISTS public.ifood_test_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_code text NOT NULL,
  order_id_ifood text,
  order_id_local uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged boolean NOT NULL DEFAULT false,
  error text
);

CREATE INDEX IF NOT EXISTS idx_ifood_test_events_event_id ON public.ifood_test_events_log(event_id);
CREATE INDEX IF NOT EXISTS idx_ifood_test_events_order_ifood ON public.ifood_test_events_log(order_id_ifood);
CREATE INDEX IF NOT EXISTS idx_ifood_test_events_processed_at ON public.ifood_test_events_log(processed_at DESC);

ALTER TABLE public.ifood_test_events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin vê ifood_test_events_log"
  ON public.ifood_test_events_log
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role gerencia ifood_test_events_log"
  ON public.ifood_test_events_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Colunas em orders para identificar origem externa oficial
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_origin text,
  ADD COLUMN IF NOT EXISTS external_order_id text;

CREATE INDEX IF NOT EXISTS idx_orders_external_origin ON public.orders(external_origin) WHERE external_origin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_external_origin_id 
  ON public.orders(external_origin, external_order_id) 
  WHERE external_origin IS NOT NULL AND external_order_id IS NOT NULL;

-- 4) Trigger para updated_at em ifood_test_config
CREATE OR REPLACE FUNCTION public.touch_ifood_test_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ifood_test_config ON public.ifood_test_config;
CREATE TRIGGER trg_touch_ifood_test_config
  BEFORE UPDATE ON public.ifood_test_config
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ifood_test_config();

-- 5) Seed da configuração inicial (1 linha) com merchant_id placeholder
INSERT INTO public.ifood_test_config (merchant_id, is_enabled, notes)
SELECT 'PENDING_SET_FROM_SECRET', true, 'Aguardando primeiro poll para validar credenciais de teste'
WHERE NOT EXISTS (SELECT 1 FROM public.ifood_test_config);
