DO $$
DECLARE
  v_admin_id uuid;
  v_hashed_pwd text;
BEGIN
  SELECT public.hash_password('123456') INTO v_hashed_pwd;
  INSERT INTO users (name, whatsapp, password, is_blocked)
  VALUES ('Admin', '11999999999', v_hashed_pwd, false)
  RETURNING id INTO v_admin_id;
  INSERT INTO user_roles (user_id, role) VALUES (v_admin_id, 'admin');
END $$