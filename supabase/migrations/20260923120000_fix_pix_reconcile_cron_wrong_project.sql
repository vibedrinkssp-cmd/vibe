-- O agendamento de mp-reconcile-pix-every-minute apontava, desde a criação,
-- para o projeto Supabase errado (djkonftjquielnqejwht em vez de
-- msbbdwmygabidjngsanv, o projeto ativo deste app). A reconciliação
-- automática de PIX pendentes nunca chegou a rodar contra o backend certo.
-- Reagenda com a URL e a chave públicas corretas deste projeto (mesma
-- publishable key já hardcoded como fallback em src/integrations/supabase/client-safe.ts).

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'mp-reconcile-pix-every-minute';
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'mp-reconcile-pix-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://msbbdwmygabidjngsanv.supabase.co/functions/v1/mp-reconcile-pix',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_VKMCbbyqxJsxzmd8nUM6WQ_rjgq7Qa_',
      'Authorization', 'Bearer sb_publishable_VKMCbbyqxJsxzmd8nUM6WQ_rjgq7Qa_'
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $$
);
