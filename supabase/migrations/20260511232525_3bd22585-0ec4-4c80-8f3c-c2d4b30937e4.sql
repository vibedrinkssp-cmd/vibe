
-- ===== Tabela: panel_credentials =====
CREATE TABLE IF NOT EXISTS public.panel_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  panel text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.panel_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to panel_credentials"
  ON public.panel_credentials FOR SELECT TO public USING (false);

CREATE POLICY "Service role manages panel_credentials"
  ON public.panel_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== Tabela: operation_pins =====
CREATE TABLE IF NOT EXISTS public.operation_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.operation_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public access to operation_pins"
  ON public.operation_pins FOR SELECT TO public USING (false);

CREATE POLICY "Service role manages operation_pins"
  ON public.operation_pins FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===== Tabela: pin_audit_log =====
CREATE TABLE IF NOT EXISTS public.pin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  success boolean NOT NULL,
  target_id uuid,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads pin_audit_log"
  ON public.pin_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages pin_audit_log"
  ON public.pin_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pin_audit_log_created_at ON public.pin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pin_audit_log_operation ON public.pin_audit_log (operation);

-- ===== RPCs =====
CREATE OR REPLACE FUNCTION public.verify_panel_password_v2(p_panel text, p_password text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash
  FROM public.panel_credentials
  WHERE panel = p_panel;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN stored_hash = extensions.crypt(p_password, stored_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_operation_pin_v2(
  p_operation text,
  p_pin text,
  p_target_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
  is_valid boolean;
BEGIN
  SELECT pin_hash INTO stored_hash
  FROM public.operation_pins
  WHERE operation = p_operation;

  IF stored_hash IS NULL THEN
    is_valid := false;
  ELSE
    is_valid := stored_hash = extensions.crypt(p_pin, stored_hash);
  END IF;

  INSERT INTO public.pin_audit_log (operation, success, target_id, user_agent)
  VALUES (p_operation, is_valid, p_target_id, p_user_agent);

  RETURN is_valid;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_panel_password_v2(
  p_panel text,
  p_old text,
  p_new text,
  p_updated_by text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_valid boolean;
BEGIN
  IF p_new !~ '^\d{8}$' THEN
    RAISE EXCEPTION 'Nova senha deve conter 8 dígitos numéricos';
  END IF;

  is_valid := public.verify_panel_password_v2(p_panel, p_old);
  IF NOT is_valid THEN RETURN false; END IF;

  UPDATE public.panel_credentials
  SET password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
      updated_at = now(),
      updated_by = p_updated_by
  WHERE panel = p_panel;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_operation_pin_v2(
  p_operation text,
  p_old text,
  p_new text,
  p_updated_by text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
  is_valid boolean;
BEGIN
  IF p_new !~ '^\d{4}$' THEN
    RAISE EXCEPTION 'Novo PIN deve conter 4 dígitos numéricos';
  END IF;

  SELECT pin_hash INTO stored_hash FROM public.operation_pins WHERE operation = p_operation;
  IF stored_hash IS NULL THEN RETURN false; END IF;
  is_valid := stored_hash = extensions.crypt(p_old, stored_hash);
  IF NOT is_valid THEN RETURN false; END IF;

  UPDATE public.operation_pins
  SET pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
      updated_at = now(),
      updated_by = p_updated_by
  WHERE operation = p_operation;

  RETURN true;
END;
$$;

-- ===== Seed inicial das credenciais =====
INSERT INTO public.panel_credentials (panel, password_hash) VALUES
  ('admin',      extensions.crypt('00827045', extensions.gen_salt('bf'))),
  ('manager',    extensions.crypt('82529763', extensions.gen_salt('bf'))),
  ('financeiro', extensions.crypt('82529763', extensions.gen_salt('bf'))),
  ('pdv',        extensions.crypt('93939393', extensions.gen_salt('bf'))),
  ('kde',        extensions.crypt('93939393', extensions.gen_salt('bf'))),
  ('log',        extensions.crypt('93939393', extensions.gen_salt('bf')))
ON CONFLICT (panel) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

INSERT INTO public.operation_pins (operation, pin_hash) VALUES
  ('excluir_pedido', extensions.crypt('9763', extensions.gen_salt('bf'))),
  ('editar_pedido',  extensions.crypt('9763', extensions.gen_salt('bf'))),
  ('ver_caixa',      extensions.crypt('9763', extensions.gen_salt('bf'))),
  ('desconto',       extensions.crypt('9763', extensions.gen_salt('bf')))
ON CONFLICT (operation) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash, updated_at = now();
