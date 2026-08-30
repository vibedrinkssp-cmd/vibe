
-- ============================================================
-- IFOOD TESTE — Módulo paralelo (não mistura com orders)
-- ============================================================

-- 1) PEDIDOS IFOOD (espelho do GET /orders/{id})
CREATE TABLE public.ifood_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ifood_order_id TEXT NOT NULL UNIQUE,
  merchant_id TEXT,
  display_id TEXT,
  status_ifood TEXT NOT NULL DEFAULT 'PLACED',
  status_vm TEXT NOT NULL DEFAULT 'PENDENTE',
  order_type TEXT,
  category TEXT,
  delivered_by TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_doc TEXT,
  delivery_address JSONB,
  items JSONB DEFAULT '[]'::jsonb,
  payments JSONB DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  change_for NUMERIC,
  fees JSONB,
  benefits JSONB,
  raw_order JSONB,
  motoboy_id UUID,
  delivery_code TEXT,
  delivery_code_verified_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  preparation_started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT
);

CREATE INDEX idx_ifood_orders_status_vm ON public.ifood_orders(status_vm);
CREATE INDEX idx_ifood_orders_imported_at ON public.ifood_orders(imported_at DESC);
CREATE INDEX idx_ifood_orders_motoboy_id ON public.ifood_orders(motoboy_id);

ALTER TABLE public.ifood_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff lê ifood_orders"
ON public.ifood_orders FOR SELECT TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pdv'::app_role)
  OR has_role(auth.uid(), 'kitchen'::app_role)
  OR has_role(auth.uid(), 'motoboy'::app_role)
);

CREATE POLICY "Service role gerencia ifood_orders"
ON public.ifood_orders FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Staff atualiza motoboy/status local em ifood_orders"
ON public.ifood_orders FOR UPDATE TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pdv'::app_role)
  OR has_role(auth.uid(), 'motoboy'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pdv'::app_role)
  OR has_role(auth.uid(), 'motoboy'::app_role)
);

-- 2) EVENTOS BRUTOS DO IFOOD
CREATE TABLE public.ifood_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ifood_event_id TEXT NOT NULL UNIQUE,
  ifood_order_id TEXT,
  code TEXT NOT NULL,
  full_code TEXT,
  metadata JSONB,
  raw_event JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'poll',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error TEXT
);

CREATE INDEX idx_ifood_events_received_at ON public.ifood_events(received_at DESC);
CREATE INDEX idx_ifood_events_order_id ON public.ifood_events(ifood_order_id);
CREATE INDEX idx_ifood_events_acknowledged ON public.ifood_events(acknowledged) WHERE acknowledged = false;

ALTER TABLE public.ifood_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lê ifood_events"
ON public.ifood_events FOR SELECT TO public
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role gerencia ifood_events"
ON public.ifood_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 3) LOG DE AÇÕES (auditoria)
CREATE TABLE public.ifood_action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ifood_order_id TEXT,
  action TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  request_payload JSONB,
  response_payload JSONB,
  http_status INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  performed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ifood_action_logs_created_at ON public.ifood_action_logs(created_at DESC);
CREATE INDEX idx_ifood_action_logs_order_id ON public.ifood_action_logs(ifood_order_id);
CREATE INDEX idx_ifood_action_logs_success ON public.ifood_action_logs(success);

ALTER TABLE public.ifood_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lê ifood_action_logs"
ON public.ifood_action_logs FOR SELECT TO public
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role gerencia ifood_action_logs"
ON public.ifood_action_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 4) Trigger updated_at
CREATE TRIGGER trg_ifood_orders_updated_at
BEFORE UPDATE ON public.ifood_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.ifood_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ifood_events;
ALTER TABLE public.ifood_orders REPLICA IDENTITY FULL;
ALTER TABLE public.ifood_events REPLICA IDENTITY FULL;
