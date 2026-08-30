-- Reagenda mp-reconcile-pix usando anon key (pública, segura para uso público).
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
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa29uZnRqcXVpZWxucWVqd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzkxMzAsImV4cCI6MjA5MjA1NTEzMH0.kvsbBMplNdwS0oWu2J0xS_Nidc8dfvdasmDpm2kOog8',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa29uZnRqcXVpZWxucWVqd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzkxMzAsImV4cCI6MjA5MjA1NTEzMH0.kvsbBMplNdwS0oWu2J0xS_Nidc8dfvdasmDpm2kOog8'
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $$
);