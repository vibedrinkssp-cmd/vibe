
-- Enable pg_net for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function that sends push notification on new order
CREATE OR REPLACE FUNCTION public.notify_new_order_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHEN 'counter' THEN v_body := '🏪 Balcão - ' || coalesce(NEW.customer_name, 'PDV');
    WHEN 'pickup' THEN v_body := '🖥️ Totem - ' || coalesce(NEW.customer_name, 'Retirada');
    ELSE v_body := 'Novo pedido recebido';
  END CASE;

  -- Get Supabase URL from settings
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_anon_key := current_setting('app.settings.supabase_anon_key', true);

  -- Fallback: use the known project URL
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://owasvhnvalnzqeiuklnu.supabase.co';
  END IF;
  IF v_anon_key IS NULL OR v_anon_key = '' THEN
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93YXN2aG52YWxuenFlaXVrbG51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNDIyMjIsImV4cCI6MjA4OTgxODIyMn0.kpmcbwWRQ0PaNkOT5lU2Be3KrlhbaFHXMMqmAJL5TCs';
  END IF;

  -- Fire and forget HTTP call to edge function
  PERFORM extensions.http_post(
    url := v_supabase_url || '/functions/v1/send-push-notification',
    body := json_build_object(
      'title', v_title,
      'body', v_body,
      'data', json_build_object('order_id', NEW.id, 'order_type', NEW.order_type)
    )::text,
    headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block order creation due to push failure
  RAISE WARNING 'Push notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Trigger after insert on orders
CREATE TRIGGER trg_notify_new_order_push
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order_push();
