-- Drop the conflicting restrictive policies
DROP POLICY IF EXISTS "Staff can view all visitor sessions" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Anon pode ler própria sessão" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Anon pode inserir visitor session" ON public.visitor_sessions;
DROP POLICY IF EXISTS "Atualizar própria sessão" ON public.visitor_sessions;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Visitor sessions select"
ON public.visitor_sessions
FOR SELECT
USING (true);

CREATE POLICY "Visitor sessions insert"
ON public.visitor_sessions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Visitor sessions update"
ON public.visitor_sessions
FOR UPDATE
USING (true)
WITH CHECK (true);