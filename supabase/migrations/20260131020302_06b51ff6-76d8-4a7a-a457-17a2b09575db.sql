-- Adicionar coluna CPF na tabela users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS cpf text;

-- Criar índice único para CPF (apenas para valores não nulos)
CREATE UNIQUE INDEX IF NOT EXISTS users_cpf_unique ON public.users(cpf) WHERE cpf IS NOT NULL;

-- Criar ou atualizar função de registro de cliente com CPF
CREATE OR REPLACE FUNCTION public.register_customer(
  p_name text,
  p_whatsapp text,
  p_cpf text,
  p_street text,
  p_number text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_complement text DEFAULT NULL,
  p_zip_code text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id UUID;
  v_address_id UUID;
  v_cpf_digits TEXT;
  v_password_hash TEXT;
  v_salt TEXT;
BEGIN
  -- Validar CPF
  v_cpf_digits := regexp_replace(p_cpf, '\D', '', 'g');
  
  IF length(v_cpf_digits) != 11 THEN
    RAISE EXCEPTION 'CPF deve ter 11 dígitos';
  END IF;
  
  -- Verificar se CPF já existe
  IF EXISTS (SELECT 1 FROM users WHERE cpf = v_cpf_digits) THEN
    RAISE EXCEPTION 'CPF já cadastrado';
  END IF;
  
  -- Verificar se WhatsApp já existe
  IF EXISTS (SELECT 1 FROM users WHERE whatsapp = p_whatsapp) THEN
    RAISE EXCEPTION 'WhatsApp já cadastrado';
  END IF;
  
  -- Gerar hash da senha (4 primeiros dígitos do CPF)
  v_salt := encode(extensions.gen_random_bytes(8), 'hex');
  v_password_hash := v_salt || ':' || encode(extensions.digest((v_salt || substring(v_cpf_digits, 1, 4))::bytea, 'sha256'), 'hex');
  
  -- Criar usuário
  INSERT INTO users (name, whatsapp, cpf, password)
  VALUES (p_name, p_whatsapp, v_cpf_digits, v_password_hash)
  RETURNING id INTO v_user_id;
  
  -- Criar role de customer
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, 'customer');
  
  -- Criar endereço
  INSERT INTO addresses (
    user_id, street, number, complement, neighborhood, 
    city, state, zip_code, notes, latitude, longitude, is_default
  )
  VALUES (
    v_user_id, p_street, p_number, p_complement, p_neighborhood,
    p_city, p_state, p_zip_code, p_notes, p_latitude, p_longitude, true
  )
  RETURNING id INTO v_address_id;
  
  RETURN v_user_id;
END;
$$;