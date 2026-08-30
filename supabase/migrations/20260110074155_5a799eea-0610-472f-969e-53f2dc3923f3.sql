-- Enable realtime for cash_register_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_register_sessions;

-- Add PDV role to SELECT policy for cash_register_sessions
DROP POLICY IF EXISTS "Admin pode ver sessões de caixa" ON public.cash_register_sessions;
CREATE POLICY "Staff pode ver sessões de caixa" 
ON public.cash_register_sessions 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Add PDV role to ALL policy for cash_register_sessions
DROP POLICY IF EXISTS "Admin pode gerenciar sessões de caixa" ON public.cash_register_sessions;
CREATE POLICY "Staff pode gerenciar sessões de caixa" 
ON public.cash_register_sessions 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));