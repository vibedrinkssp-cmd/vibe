
-- Create caderneta_payments table to track payments (partial or full)
CREATE TABLE public.caderneta_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.caderneta_customers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.caderneta_payments ENABLE ROW LEVEL SECURITY;

-- Staff can manage payments
CREATE POLICY "Staff pode gerenciar caderneta_payments"
  ON public.caderneta_payments
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Staff can read payments
CREATE POLICY "Staff pode ver caderneta_payments"
  ON public.caderneta_payments
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));
