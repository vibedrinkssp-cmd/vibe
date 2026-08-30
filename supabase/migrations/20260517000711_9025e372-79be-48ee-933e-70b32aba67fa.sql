-- Reconciliação automática de PIX pendentes a cada 1 minuto.
-- Usa pg_net para invocar a edge function mp-reconcile-pix com a service role.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior se existir (idempotente)
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
    url := 'https://djkonftjquielnqejwht.supabase.co/functions/v1/mp-reconcile-pix',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $$
);