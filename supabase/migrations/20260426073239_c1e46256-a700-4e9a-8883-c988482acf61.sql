CREATE OR REPLACE FUNCTION public.notify_new_order_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_anon_key text;
  v_title text;
  v_body text;
  v_order_code text;
BEGIN
  v_order_code := upper(substring(NEW.id::text from 1 for 6));
  v_title := '🔔 Novo Pedido #' || v_order_code;

  CASE NEW.order_type
    WHEN 'delivery' THEN v_body := '📦 Delivery - ' || coalesce(NEW.customer_name, 'Cliente');
    WHEN 'counter'  THEN v_body := '🏪 Balcão - '   || coalesce(NEW.customer_name, 'PDV');
    WHEN 'totem'    THEN v_body := '🖥️ Totem - '    || coalesce(NEW.customer_name, 'Cliente');
    WHEN 'pickup'   THEN v_body := '🛍️ Retirada - ' || coalesce(NEW.customer_name, 'Cliente');
    ELSE v_body := 'Novo pedido recebido';
  END CASE;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://djkonftjquielnqejwht.supabase.co';
  END IF;
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqa29uZnRqcXVpZWxucWVqd2h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NzkxMzAsImV4cCI6MjA5MjA1NTEzMH0.kvsbBMplNdwS0oWu2J0xS_Nidc8dfvdasmDpm2kOog8';
  END IF;

  -- Fire-and-forget HTTP call via pg_net (returns immediately, doesn't block the INSERT)
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    body := jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object('order_id', NEW.id, 'order_type', NEW.order_type)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;