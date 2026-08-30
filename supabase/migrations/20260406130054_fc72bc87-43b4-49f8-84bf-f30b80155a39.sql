
DO $$
DECLARE
  v_salt TEXT;
  v_hash TEXT;
BEGIN
  v_salt := gen_random_uuid()::TEXT;
  v_hash := encode(extensions.digest((v_salt || 'totem93')::bytea, 'sha256'), 'hex');
  
  UPDATE users 
  SET password = 'sha256:' || v_salt || ':' || v_hash
  WHERE id = 'd7659d91-b07c-465e-a50b-6aa6b7058280';
END $$;
