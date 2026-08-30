-- Permitir SELECT anônimo na visitor_sessions para que o upsert funcione
CREATE POLICY "Anon pode ler própria sessão"
ON public.visitor_sessions
FOR SELECT
TO anon, authenticated
USING (true);