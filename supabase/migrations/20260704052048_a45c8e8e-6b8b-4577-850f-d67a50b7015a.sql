-- Travar definitivamente entrada/pulo direto para ENTREGUE.
-- Regra operacional: todo pedido entra ativo e passa por Cozinha ou Logística antes de finalizar.

CREATE OR REPLACE FUNCTION public.prevent_direct_delivered_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Nenhum pedido pode nascer entregue. PIX sem confirmação fica pending; demais ficam accepted.
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
    -- Só permite finalizar se o pedido já passou pela fila operacional.
    -- Cozinha/Logística deixam o pedido em ready; motoboy usa dispatched/arrived.
    IF NEW.status = 'delivered'::order_status
       AND OLD.status IS DISTINCT FROM 'delivered'::order_status THEN
      IF OLD.status NOT IN ('ready'::order_status, 'dispatched'::order_status, 'arrived'::order_status) THEN
        RAISE EXCEPTION 'Pedido precisa passar por Cozinha/Logística antes de ser marcado como entregue. Status atual: %', OLD.status
          USING ERRCODE = 'check_violation';
      END IF;

      IF COALESCE(NEW.ready_at, OLD.ready_at, NEW.dispatched_at, OLD.dispatched_at, NEW.arrived_at, OLD.arrived_at) IS NULL THEN
        RAISE EXCEPTION 'Pedido não possui marco operacional (pronto/despachado/chegou) para finalizar como entregue'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Se voltou para status ativo, remove data de entrega para não confundir relatórios.
    IF NEW.status IS DISTINCT FROM 'delivered'::order_status THEN
      NEW.delivered_at := NULL;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_delivered_orders_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_prevent_direct_delivered_orders_update ON public.orders;

CREATE TRIGGER trg_prevent_direct_delivered_orders_insert
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_delivered_orders();

CREATE TRIGGER trg_prevent_direct_delivered_orders_update
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_delivered_orders();

-- Desativa a automação antiga que concluía retirada/balcão/totem sem clique humano.
CREATE OR REPLACE FUNCTION public.auto_complete_pickup_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Intencionalmente vazio: pedidos de retirada só finalizam por ação manual em Logística/Cozinha.
  RETURN;
END;
$$;

-- Desativa limpeza antiga que empurrava pedidos abertos para entregue após tempo.
CREATE OR REPLACE FUNCTION public.cleanup_stale_open_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Intencionalmente vazio: pedido aberto deve ser tratado manualmente, não concluído automaticamente.
  RETURN;
END;
$$;

-- Remove gatilho antigo que finalizava automaticamente totem varejo ao inserir itens.
DROP TRIGGER IF EXISTS trg_finalize_totem_retail ON public.order_items;

CREATE OR REPLACE FUNCTION public.finalize_totem_retail_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Intencionalmente vazio: totem/varejo entra na Logística e só sai por ação manual.
  RETURN NULL;
END;
$$;

-- Reforça os RPCs principais para dependerem da trava acima e preservarem atomicidade.
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_accepted_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_preparing_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_ready_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_dispatched_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_arrived_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.orders SET
    status = p_status,
    accepted_at = COALESCE(p_accepted_at, accepted_at),
    preparing_at = COALESCE(p_preparing_at, preparing_at),
    ready_at = COALESCE(p_ready_at, ready_at),
    dispatched_at = COALESCE(p_dispatched_at, dispatched_at),
    arrived_at = COALESCE(p_arrived_at, arrived_at),
    delivered_at = CASE WHEN p_status = 'delivered'::order_status THEN COALESCE(p_delivered_at, now()) ELSE delivered_at END
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_order_status_motoboy(
  p_motoboy_id uuid,
  p_order_id uuid,
  p_status public.order_status,
  p_arrived_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_delivered_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.motoboys WHERE id = p_motoboy_id AND is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND motoboy_id = p_motoboy_id) THEN
    RAISE EXCEPTION 'Pedido não atribuído a este motoboy';
  END IF;

  IF p_status NOT IN ('arrived'::order_status, 'delivered'::order_status) THEN
    RAISE EXCEPTION 'Motoboy só pode marcar como chegou ou entregue';
  END IF;

  UPDATE public.orders SET
    status = p_status,
    arrived_at = COALESCE(p_arrived_at, arrived_at),
    delivered_at = CASE WHEN p_status = 'delivered'::order_status THEN COALESCE(p_delivered_at, now()) ELSE delivered_at END
  WHERE id = p_order_id AND motoboy_id = p_motoboy_id;
END;
$$;