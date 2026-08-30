CREATE OR REPLACE FUNCTION public.prevent_direct_delivered_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_external boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'delivered'::order_status THEN
      NEW.status := CASE
        WHEN NEW.payment_method = 'pix'::payment_method AND COALESCE(NEW.payment_confirmed, false) IS DISTINCT FROM true
          THEN 'pending'::order_status
        ELSE 'accepted'::order_status
      END;
      NEW.delivered_at := NULL;
      NEW.arrived_at := NULL;
      NEW.dispatched_at := NULL;
      NEW.ready_at := NULL;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Pedidos de plataformas externas (iFood/99Food) são entregues pela nuvem
    -- da própria plataforma e podem ser finalizados sem passar pela fila operacional.
    v_is_external := NEW.external_origin IS NOT NULL
      OR LOWER(COALESCE(NEW.salesperson, '')) IN ('ifood', '99food', 'ifood_test');

    IF NEW.status = 'delivered'::order_status
       AND OLD.status IS DISTINCT FROM 'delivered'::order_status
       AND NOT v_is_external THEN
      IF OLD.status NOT IN ('ready'::order_status, 'dispatched'::order_status, 'arrived'::order_status) THEN
        RAISE EXCEPTION 'Pedido precisa passar por Cozinha/Logística antes de ser marcado como entregue. Status atual: %', OLD.status
          USING ERRCODE = 'check_violation';
      END IF;

      IF COALESCE(NEW.ready_at, OLD.ready_at, NEW.dispatched_at, OLD.dispatched_at, NEW.arrived_at, OLD.arrived_at) IS NULL THEN
        RAISE EXCEPTION 'Pedido não possui marco operacional (pronto/despachado/chegou) para finalizar como entregue'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM 'delivered'::order_status THEN
      NEW.delivered_at := NULL;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;