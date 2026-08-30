
CREATE OR REPLACE FUNCTION public.create_caderneta_customer(p_name text, p_whatsapp text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO caderneta_customers (name, whatsapp)
  VALUES (UPPER(p_name), p_whatsapp)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
