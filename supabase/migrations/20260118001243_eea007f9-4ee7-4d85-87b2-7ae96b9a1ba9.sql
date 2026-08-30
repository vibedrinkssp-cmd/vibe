-- Recreate the function using the correct pgcrypto reference
CREATE OR REPLACE FUNCTION public.hash_password(p_password text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_salt text;
  v_hash text;
BEGIN
  -- Generate a random salt (16 hex characters)
  v_salt := encode(extensions.gen_random_bytes(8), 'hex');
  -- Create SHA-256 hash of salt + password
  v_hash := encode(extensions.digest((v_salt || p_password)::bytea, 'sha256'), 'hex');
  -- Return in format salt:hash
  RETURN v_salt || ':' || v_hash;
END;
$$;