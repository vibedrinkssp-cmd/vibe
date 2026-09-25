-- Taxas por plataforma (iFood/99Food/...) + relatório diário de vendas.
--
-- 1) platform_fee_settings: taxa PADRÃO por plataforma (comissão + pagamento online + fixa).
--    É só o valor sugerido; a taxa real varia por pedido e é gravada em order_platform_fees.
-- 2) order_platform_fees: "retrato" da taxa de cada pedido de plataforma (editável no PDV).
--    Pedidos sem linha aqui usam a taxa padrão no relatório.
-- 3) get_daily_report: consolida vendas por canal, pagamento, produtos e hora.

CREATE TABLE IF NOT EXISTS public.platform_fee_settings (
  platform text PRIMARY KEY,
  fee_percent numeric(6,2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  fixed_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (fixed_fee >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_fee_settings ENABLE ROW LEVEL SECURITY;

-- Valores provisórios: ajustar na tela de Configurações conforme o plano de cada plataforma.
INSERT INTO public.platform_fee_settings (platform, fee_percent, fixed_fee) VALUES
  ('ifood', 27, 0),
  ('99food', 25, 0),
  ('keeta', 20, 0),
  ('rappi', 25, 0)
ON CONFLICT (platform) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.order_platform_fees (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  platform text NOT NULL,
  fee_percent numeric(6,2) NOT NULL CHECK (fee_percent >= 0 AND fee_percent <= 100),
  fee_amount numeric(10,2) NOT NULL CHECK (fee_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_platform_fees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_platform_fee_settings()
RETURNS SETOF public.platform_fee_settings
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.platform_fee_settings ORDER BY platform;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_platform_fee_setting(
  p_platform text,
  p_fee_percent numeric,
  p_fixed_fee numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.platform_fee_settings (platform, fee_percent, fixed_fee, updated_at)
  VALUES (lower(p_platform), p_fee_percent, COALESCE(p_fixed_fee, 0), now())
  ON CONFLICT (platform) DO UPDATE
    SET fee_percent = EXCLUDED.fee_percent,
        fixed_fee = EXCLUDED.fixed_fee,
        updated_at = now();
END;
$$;

-- Grava (ou corrige) a taxa real de um pedido de plataforma. fee_amount é calculado
-- sobre o total do pedido; p_fee_amount permite informar o valor exato do extrato.
CREATE OR REPLACE FUNCTION public.set_order_platform_fee(
  p_order_id uuid,
  p_platform text,
  p_fee_percent numeric,
  p_fee_amount numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric;
  v_amount numeric;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT total INTO v_total FROM public.orders WHERE id = p_order_id;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  v_amount := COALESCE(p_fee_amount, round(v_total * p_fee_percent / 100, 2));

  INSERT INTO public.order_platform_fees (order_id, platform, fee_percent, fee_amount)
  VALUES (p_order_id, lower(p_platform), p_fee_percent, v_amount)
  ON CONFLICT (order_id) DO UPDATE
    SET platform = EXCLUDED.platform,
        fee_percent = EXCLUDED.fee_percent,
        fee_amount = EXCLUDED.fee_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_report(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  WITH base AS (
    SELECT
      o.id,
      o.total,
      o.payment_method::text AS payment_method,
      o.created_at,
      CASE
        WHEN lower(COALESCE(o.salesperson, '')) IN ('ifood', '99food', 'keeta', 'rappi') THEN lower(o.salesperson)
        WHEN COALESCE(o.external_origin, '') LIKE 'ifood%' THEN 'ifood'
        WHEN o.order_type::text = 'counter' THEN 'balcao'
        ELSE 'delivery'
      END AS channel
    FROM public.orders o
    WHERE o.created_at >= p_start
      AND o.created_at < p_end
      AND o.status::text NOT IN ('pending', 'cancelled')
  ),
  items AS (
    SELECT
      oi.order_id,
      SUM(oi.total_price) AS revenue,
      SUM(COALESCE(p.cost_price, 0) * oi.quantity) AS cost
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id IN (SELECT id FROM base)
    GROUP BY oi.order_id
  ),
  enriched AS (
    SELECT
      b.*,
      COALESCE(i.revenue, 0) AS items_revenue,
      COALESCE(i.cost, 0) AS items_cost,
      CASE
        WHEN b.channel IN ('balcao', 'delivery') THEN 0
        ELSE COALESCE(
          f.fee_amount,
          round(b.total * COALESCE(s.fee_percent, 0) / 100 + COALESCE(s.fixed_fee, 0), 2)
        )
      END AS fee
    FROM base b
    LEFT JOIN items i ON i.order_id = b.id
    LEFT JOIN public.order_platform_fees f ON f.order_id = b.id
    LEFT JOIN public.platform_fee_settings s ON s.platform = b.channel
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'orders', COUNT(*),
        'gross', COALESCE(SUM(total), 0),
        'items_revenue', COALESCE(SUM(items_revenue), 0),
        'cost', COALESCE(SUM(items_cost), 0),
        'fees', COALESCE(SUM(fee), 0),
        'profit', COALESCE(SUM(items_revenue - items_cost - fee), 0)
      ) FROM enriched
    ),
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'channel', channel,
        'orders', orders,
        'gross', gross,
        'fees', fees,
        'net', gross - fees,
        'cost', cost,
        'profit', profit
      ) ORDER BY gross DESC)
      FROM (
        SELECT channel,
               COUNT(*) AS orders,
               SUM(total) AS gross,
               SUM(fee) AS fees,
               SUM(items_cost) AS cost,
               SUM(items_revenue - items_cost - fee) AS profit
        FROM enriched GROUP BY channel
      ) c
    ), '[]'::jsonb),
    -- Pagamentos só dos canais próprios: pedido de plataforma já foi pago no app.
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('method', payment_method, 'orders', n, 'total', t) ORDER BY t DESC)
      FROM (
        SELECT payment_method, COUNT(*) AS n, SUM(total) AS t
        FROM enriched WHERE channel IN ('balcao', 'delivery') GROUP BY payment_method
      ) p
    ), '[]'::jsonb),
    'top_products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'quantity', q, 'revenue', r) ORDER BY q DESC)
      FROM (
        SELECT oi.product_name AS name, SUM(oi.quantity) AS q, SUM(oi.total_price) AS r
        FROM public.order_items oi
        WHERE oi.order_id IN (SELECT id FROM enriched)
        GROUP BY oi.product_name
        ORDER BY SUM(oi.quantity) DESC
        LIMIT 15
      ) tp
    ), '[]'::jsonb),
    'hourly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('hour', h, 'orders', n, 'gross', g) ORDER BY h)
      FROM (
        SELECT extract(hour FROM created_at AT TIME ZONE 'America/Sao_Paulo')::int AS h,
               COUNT(*) AS n, SUM(total) AS g
        FROM enriched GROUP BY 1
      ) hh
    ), '[]'::jsonb),
    'cancelled', (
      SELECT COUNT(*) FROM public.orders o
      WHERE o.created_at >= p_start AND o.created_at < p_end AND o.status::text = 'cancelled'
    ),
    'sangrias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', type, 'total', t, 'count', n))
      FROM (
        SELECT type, SUM(amount) AS t, COUNT(*) AS n
        FROM public.sangrias
        WHERE created_at >= p_start AND created_at < p_end
        GROUP BY type
      ) sg
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_fee_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_platform_fee_setting(text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_order_platform_fee(uuid, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_daily_report(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_platform_fee_settings() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_platform_fee_setting(text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_platform_fee(uuid, text, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_report(timestamptz, timestamptz) TO authenticated, service_role;
