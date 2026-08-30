
-- ===================================================================
-- WAVE 7: Motoboy Atomicity
-- Garante que motoboys existam atomicamente em motoboys + users + user_roles
-- ===================================================================

-- 1. Helper: criar/sincronizar registro em users + user_roles para um motoboy
CREATE OR REPLACE FUNCTION public._sync_motoboy_to_users(
  p_motoboy_id uuid,
  p_name text,
  p_whatsapp text,
  p_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert em users usando o MESMO id do motoboy (chave de ligação)
  INSERT INTO public.users (id, name, whatsapp, password, is_blocked)
  VALUES (p_motoboy_id, p_name, p_whatsapp, p_password, false)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        whatsapp = EXCLUDED.whatsapp,
        password = COALESCE(EXCLUDED.password, public.users.password),
        is_blocked = false;

  -- Garantir role 'motoboy'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_motoboy_id, 'motoboy'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- 2. register_motoboy_self: agora ATÔMICO (motoboys + users + user_roles)
CREATE OR REPLACE FUNCTION public.register_motoboy_self(
  p_name text,
  p_cpf text,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_digits text;
  v_whatsapp_digits text;
  v_password text;
  v_next_slot integer;
BEGIN
  v_digits := regexp_replace(p_cpf, '\D', '', 'g');
  v_whatsapp_digits := regexp_replace(p_whatsapp, '\D', '', 'g');

  IF length(v_digits) != 11 THEN
    RETURN json_build_object('success', false, 'error', 'CPF deve ter 11 dígitos');
  END IF;

  IF EXISTS (SELECT 1 FROM motoboys WHERE cpf = v_digits) THEN
    RETURN json_build_object('success', false, 'error', 'CPF já cadastrado');
  END IF;

  -- Bloquear duplicidade de whatsapp em users (regra do auth-login)
  IF EXISTS (SELECT 1 FROM users WHERE whatsapp = v_whatsapp_digits) THEN
    RETURN json_build_object('success', false, 'error', 'WhatsApp já cadastrado no sistema');
  END IF;

  v_password := substring(v_digits from 1 for 4);

  SELECT MIN(s.n) INTO v_next_slot
  FROM generate_series(1, 10) AS s(n)
  WHERE NOT EXISTS (SELECT 1 FROM motoboys WHERE slot_number = s.n);

  IF v_next_slot IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Limite de vagas atingido (máx. 10 motoboys)');
  END IF;

  -- Inserir em motoboys e capturar id
  INSERT INTO motoboys (name, cpf, whatsapp, password, is_active, slot_number)
  VALUES (p_name, v_digits, v_whatsapp_digits, v_password, true, v_next_slot)
  RETURNING id INTO v_id;

  -- Sincronizar atomicamente em users + user_roles (mesmo id)
  PERFORM public._sync_motoboy_to_users(v_id, p_name, v_whatsapp_digits, v_password);

  RETURN json_build_object(
    'success', true,
    'motoboy', json_build_object(
      'id', v_id,
      'name', p_name,
      'whatsapp', v_whatsapp_digits,
      'is_active', true
    )
  );
END;
$$;

-- 3. login_motoboy_by_cpf: self-healing — recria users/user_roles se faltarem
CREATE OR REPLACE FUNCTION public.login_motoboy_by_cpf(p_cpf text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motoboy motoboys%ROWTYPE;
  v_cpf_digits text;
BEGIN
  v_cpf_digits := regexp_replace(p_cpf, '\D', '', 'g');

  SELECT * INTO v_motoboy FROM motoboys WHERE cpf = v_cpf_digits;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'CPF não cadastrado', 'not_found', true);
  END IF;

  IF NOT v_motoboy.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Conta desativada pelo administrador');
  END IF;

  IF p_password = v_motoboy.password THEN
    -- Self-healing: garantir que existe em users + user_roles para o auth-login funcionar
    PERFORM public._sync_motoboy_to_users(v_motoboy.id, v_motoboy.name, v_motoboy.whatsapp, v_motoboy.password);

    RETURN json_build_object(
      'success', true,
      'motoboy', json_build_object(
        'id', v_motoboy.id,
        'name', v_motoboy.name,
        'whatsapp', v_motoboy.whatsapp,
        'is_active', v_motoboy.is_active
      )
    );
  END IF;

  RETURN json_build_object('success', false, 'error', 'Senha incorreta');
END;
$$;

-- 4. assign_motoboy_atomic: atribuição segura, retorna confirmação JSON
CREATE OR REPLACE FUNCTION public.assign_motoboy_atomic(
  p_order_id uuid,
  p_motoboy_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_motoboy motoboys%ROWTYPE;
BEGIN
  -- Validar pedido
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Pedido não encontrado');
  END IF;

  -- Validar motoboy ativo
  SELECT * INTO v_motoboy FROM motoboys WHERE id = p_motoboy_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy não encontrado');
  END IF;
  IF NOT v_motoboy.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy inativo');
  END IF;

  -- Garantir presença em users + user_roles antes da atribuição
  PERFORM public._sync_motoboy_to_users(v_motoboy.id, v_motoboy.name, v_motoboy.whatsapp, v_motoboy.password);

  -- Atualização atômica
  UPDATE orders
    SET motoboy_id = p_motoboy_id,
        status = CASE WHEN status IN ('accepted','ready') THEN 'dispatched'::order_status ELSE status END,
        dispatched_at = COALESCE(dispatched_at, now()),
        picked_up_at = CASE WHEN motoboy_id IS DISTINCT FROM p_motoboy_id THEN NULL ELSE picked_up_at END
  WHERE id = p_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'motoboy_id', p_motoboy_id,
    'motoboy_name', v_motoboy.name
  );
END;
$$;

-- 5. BACKFILL: sincronizar os 5 motoboys existentes em users + user_roles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, name, whatsapp, password FROM motoboys WHERE is_active = true LOOP
    PERFORM public._sync_motoboy_to_users(r.id, r.name, r.whatsapp, r.password);
  END LOOP;
END $$;

-- 6. Permissões
REVOKE ALL ON FUNCTION public._sync_motoboy_to_users(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_motoboy_atomic(uuid, uuid) TO authenticated;
