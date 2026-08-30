
-- Add CPF column to motoboys table
ALTER TABLE public.motoboys ADD COLUMN IF NOT EXISTS cpf text UNIQUE;

-- Update motoboys_public view to include cpf (masked)
DROP VIEW IF EXISTS public.motoboys_public;
CREATE VIEW public.motoboys_public AS
SELECT 
  id,
  name,
  is_active,
  slot_number
FROM public.motoboys;

-- Create self-registration function for motoboys
CREATE OR REPLACE FUNCTION public.register_motoboy_self(
  p_name text,
  p_cpf text,
  p_whatsapp text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_digits text;
  v_password text;
  v_next_slot integer;
BEGIN
  -- Extract only digits from CPF
  v_digits := regexp_replace(p_cpf, '\D', '', 'g');
  
  -- Validate CPF has 11 digits
  IF length(v_digits) != 11 THEN
    RETURN json_build_object('success', false, 'error', 'CPF deve ter 11 dígitos');
  END IF;
  
  -- Check if CPF already registered
  IF EXISTS (SELECT 1 FROM motoboys WHERE cpf = v_digits) THEN
    RETURN json_build_object('success', false, 'error', 'CPF já cadastrado');
  END IF;
  
  -- Password = last 4 digits of CPF
  v_password := substring(v_digits from 8 for 4);
  
  -- Find next available slot (1-10)
  SELECT MIN(s.n) INTO v_next_slot
  FROM generate_series(1, 10) AS s(n)
  WHERE NOT EXISTS (SELECT 1 FROM motoboys WHERE slot_number = s.n);
  
  -- Insert new motoboy (is_active = false until admin approves)
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

-- Update verify_motoboy_login to support CPF-based login
-- Login by CPF (last 4 digits as password)
CREATE OR REPLACE FUNCTION public.verify_motoboy_login(p_motoboy_id uuid, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_motoboy motoboys%ROWTYPE;
  v_stored_password text;
  v_salt text;
  v_hash text;
  v_computed_hash text;
BEGIN
  SELECT * INTO v_motoboy FROM motoboys WHERE id = p_motoboy_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy não encontrado');
  END IF;
  
  IF NOT v_motoboy.is_active THEN
    RETURN json_build_object('success', false, 'error', 'Motoboy desativado pelo administrador');
  END IF;
  
  v_stored_password := v_motoboy.password;
  
  IF v_stored_password IS NULL OR v_stored_password = '' THEN
    RETURN json_build_object('success', false, 'error', 'Senha não configurada');
  END IF;
  
  -- Check if hashed (sha256:salt:hash format)
  IF v_stored_password LIKE 'sha256:%' THEN
    v_salt := split_part(v_stored_password, ':', 2);
    v_hash := split_part(v_stored_password, ':', 3);
    v_computed_hash := encode(digest(p_password || v_salt, 'sha256'), 'hex');
    
    IF v_computed_hash = v_hash THEN
      RETURN json_build_object(
        'success', true, 
        'motoboy', json_build_object(
          'id', v_motoboy.id,
          'name', v_motoboy.name,
          'whatsapp', v_motoboy.whatsapp,
          'is_active', v_motoboy.is_active
        )
      );
    ELSE
      RETURN json_build_object('success', false, 'error', 'Senha incorreta');
    END IF;
  ELSE
    -- Plaintext comparison
    IF p_password = v_stored_password THEN
      RETURN json_build_object(
        'success', true, 
        'motoboy', json_build_object(
          'id', v_motoboy.id,
          'name', v_motoboy.name,
          'whatsapp', v_motoboy.whatsapp,
          'is_active', v_motoboy.is_active
        )
      );
    ELSE
      RETURN json_build_object('success', false, 'error', 'Senha incorreta');
    END IF;
  END IF;
END;
$$;

-- Create a function to login by CPF directly
CREATE OR REPLACE FUNCTION public.login_motoboy_by_cpf(p_cpf text, p_password text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  
  -- Password is last 4 digits of CPF
  IF p_password = v_motoboy.password THEN
    RETURN json_build_object(
      'success', true,
      'motoboy', json_build_object(
        'id', v_motoboy.id,
        'name', v_motoboy.name,
        'whatsapp', v_motoboy.whatsapp,
        'is_active', v_motoboy.is_active
      )
    );
  ELSE
    RETURN json_build_object('success', false, 'error', 'Senha incorreta');
  END IF;
END;
$$;
