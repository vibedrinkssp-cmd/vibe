
-- Create employee
CREATE OR REPLACE FUNCTION public.create_employee(
  p_name text,
  p_whatsapp text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO employees (name, whatsapp, is_active)
  VALUES (p_name, p_whatsapp, p_is_active)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Update employee
CREATE OR REPLACE FUNCTION public.update_employee(
  p_id uuid,
  p_name text,
  p_whatsapp text DEFAULT NULL,
  p_is_active boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE employees
  SET name = p_name, whatsapp = p_whatsapp, is_active = p_is_active
  WHERE id = p_id;
END;
$$;

-- Delete employee
CREATE OR REPLACE FUNCTION public.delete_employee(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM employees WHERE id = p_id;
END;
$$;
