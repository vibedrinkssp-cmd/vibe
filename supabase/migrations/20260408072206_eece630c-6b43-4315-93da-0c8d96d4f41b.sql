
CREATE OR REPLACE FUNCTION public.register_motoboy_self(p_name text, p_cpf text, p_whatsapp text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_digits text;
  v_password text;
  v_next_slot integer;
BEGIN
  v_digits := regexp_replace(p_cpf, '\D', '', 'g');

  IF length(v_digits) != 11 THEN
    RETURN json_build_object('success', false, 'error', 'CPF deve ter 11 dígitos');
  END IF;

  IF EXISTS (SELECT 1 FROM motoboys WHERE cpf = v_digits) THEN
    RETURN json_build_object('success', false, 'error', 'CPF já cadastrado');
  END IF;

  -- Password = FIRST 4 digits of CPF
  v_password := substring(v_digits from 1 for 4);

  SELECT MIN(s.n) INTO v_next_slot
  FROM generate_series(1, 10) AS s(n)
  WHERE NOT EXISTS (SELECT 1 FROM motoboys WHERE slot_number = s.n);

  IF v_next_slot IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Limite de vagas atingido (máx. 10 motoboys). Contate o administrador.');
  END IF;

  INSERT INTO motoboys (name, cpf, whatsapp, password, is_active, slot_number)
  VALUES (p_name, v_digits, regexp_replace(p_whatsapp, '\D', '', 'g'), v_password, true, v_next_slot)
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'success', true,
    'motoboy', json_build_object(
      'id', v_id,
      'name', p_name,
      'whatsapp', regexp_replace(p_whatsapp, '\D', '', 'g'),
      'is_active', true
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_motoboy_self(text, text, text) TO anon;
