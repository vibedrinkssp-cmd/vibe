-- Onda 6 — Observabilidade & Reconciliação
-- Cria view consolidada para auditoria de divergências entre saques/depósitos e sessões de caixa
-- e função RPC para obter resumo geral de reconciliação

-- View: divergências e saúde dos registros financeiros
CREATE OR REPLACE VIEW public.v_cash_reconciliation
WITH (security_invoker=on) AS
SELECT
  ct.id,
  ct.created_at,
  ct.type,
  ct.amount,
  ct.fee,
  ct.total,
  ct.payment_method,
  ct.responsible,
  ct.session_id,
  s.status AS session_status,
  s.opened_at AS session_opened_at,
  s.closed_at AS session_closed_at,
  CASE
    WHEN ct.payment_method IS NULL THEN 'sem_metodo_pagamento'
    WHEN ct.session_id IS NULL THEN 'sem_sessao'
    WHEN ct.type = 'saque' AND ct.fee = 0 THEN 'taxa_zero_suspeita'
    WHEN ct.type = 'saque' AND ct.total <> (ct.amount + ct.fee) THEN 'total_incorreto'
    WHEN ct.type = 'deposito' AND ct.total <> (ct.amount - ct.fee) THEN 'total_incorreto'
    ELSE 'ok'
  END AS health_status
FROM public.cash_transactions ct
LEFT JOIN public.cash_register_sessions s ON s.id = ct.session_id;

-- RPC: resumo de reconciliação (apenas admin)
CREATE OR REPLACE FUNCTION public.get_reconciliation_summary(
  p_start_date timestamptz DEFAULT (now() - interval '90 days'),
  p_end_date timestamptz DEFAULT now()
)
RETURNS TABLE (
  total_transacoes bigint,
  total_saques bigint,
  total_depositos bigint,
  saques_sem_metodo bigint,
  depositos_sem_metodo bigint,
  saques_sem_sessao bigint,
  depositos_sem_sessao bigint,
  totais_incorretos bigint,
  taxas_zero_suspeitas bigint,
  valor_total_saques numeric,
  valor_total_depositos numeric,
  valor_total_taxas numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_transacoes,
    COUNT(*) FILTER (WHERE type = 'saque')::bigint AS total_saques,
    COUNT(*) FILTER (WHERE type = 'deposito')::bigint AS total_depositos,
    COUNT(*) FILTER (WHERE type = 'saque' AND payment_method IS NULL)::bigint AS saques_sem_metodo,
    COUNT(*) FILTER (WHERE type = 'deposito' AND payment_method IS NULL)::bigint AS depositos_sem_metodo,
    COUNT(*) FILTER (WHERE type = 'saque' AND session_id IS NULL)::bigint AS saques_sem_sessao,
    COUNT(*) FILTER (WHERE type = 'deposito' AND session_id IS NULL)::bigint AS depositos_sem_sessao,
    COUNT(*) FILTER (WHERE health_status = 'total_incorreto')::bigint AS totais_incorretos,
    COUNT(*) FILTER (WHERE health_status = 'taxa_zero_suspeita')::bigint AS taxas_zero_suspeitas,
    COALESCE(SUM(amount) FILTER (WHERE type = 'saque'), 0) AS valor_total_saques,
    COALESCE(SUM(amount) FILTER (WHERE type = 'deposito'), 0) AS valor_total_depositos,
    COALESCE(SUM(fee), 0) AS valor_total_taxas
  FROM public.v_cash_reconciliation
  WHERE created_at >= p_start_date AND created_at <= p_end_date;
$$;

REVOKE ALL ON FUNCTION public.get_reconciliation_summary(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_reconciliation_summary(timestamptz, timestamptz) TO authenticated;

-- Índice para acelerar consultas por tipo + período
CREATE INDEX IF NOT EXISTS idx_cash_transactions_type_created
  ON public.cash_transactions(type, created_at DESC);
