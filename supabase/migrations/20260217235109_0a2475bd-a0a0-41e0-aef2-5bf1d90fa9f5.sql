
-- Fix #1 & #2: Visitor Sessions RLS - recreate as PERMISSIVE
DROP POLICY IF EXISTS "Anon pode inserir visitor session" ON visitor_sessions;
DROP POLICY IF EXISTS "Atualizar própria sessão" ON visitor_sessions;

-- Recreate INSERT as PERMISSIVE so anon key works
CREATE POLICY "Anon pode inserir visitor session"
ON visitor_sessions FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Recreate UPDATE as PERMISSIVE so anon key works
CREATE POLICY "Atualizar própria sessão"
ON visitor_sessions FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
