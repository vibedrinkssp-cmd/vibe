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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE type = 'saque')::bigint,
    COUNT(*) FILTER (WHERE type = 'deposito')::bigint,
    COUNT(*) FILTER (WHERE type = 'saque' AND payment_method IS NULL)::bigint,
    COUNT(*) FILTER (WHERE type = 'deposito' AND payment_method IS NULL)::bigint,
    COUNT(*) FILTER (WHERE type = 'saque' AND session_id IS NULL)::bigint,
    COUNT(*) FILTER (WHERE type = 'deposito' AND session_id IS NULL)::bigint,
    COUNT(*) FILTER (WHERE health_status = 'total_incorreto')::bigint,
    COUNT(*) FILTER (WHERE health_status = 'taxa_zero_suspeita')::bigint,
    COALESCE(SUM(amount) FILTER (WHERE type = 'saque'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'deposito'), 0),
    COALESCE(SUM(fee), 0)
  FROM public.v_cash_reconciliation
  WHERE created_at >= p_start_date AND created_at <= p_end_date;
END;
$$;