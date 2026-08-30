
-- Create employees table
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  whatsapp text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Admin can manage employees
CREATE POLICY "Admin pode gerenciar employees"
  ON public.employees FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Staff can read employees  
CREATE POLICY "Staff pode ver employees"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'pdv'::app_role)
    OR has_role(auth.uid(), 'kitchen'::app_role)
  );
