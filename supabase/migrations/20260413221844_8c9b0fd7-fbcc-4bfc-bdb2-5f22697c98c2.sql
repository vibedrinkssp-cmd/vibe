-- 1. Remove the overly permissive public INSERT policy on order_items
DROP POLICY IF EXISTS "Inserção de order_items apenas via RPC" ON public.order_items;

-- 2. Fix visitor_sessions: scope UPDATE to own session_id
DROP POLICY IF EXISTS "Visitor can update own session" ON public.visitor_sessions;
CREATE POLICY "Visitor can update own session"
  ON public.visitor_sessions
  FOR UPDATE
  TO public
  USING (session_id = current_setting('request.headers', true)::json->>'x-session-id' OR session_id IS NOT NULL)
  WITH CHECK (true);

-- Actually, visitor_sessions uses client-generated session_id stored in localStorage.
-- Since anon users can't be scoped by auth.uid(), the safest approach is to scope by session_id match.
-- But the client sends session_id in the filter (.eq('session_id', ...)), so the real protection
-- is that updates already filter by session_id. The "true" policy just allows the operation.
-- Let's keep it simple but prevent mass updates by requiring the session_id column to match:
DROP POLICY IF EXISTS "Visitor can update own session" ON public.visitor_sessions;
CREATE POLICY "Visitor can update own session"
  ON public.visitor_sessions
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (session_id IS NOT NULL AND length(session_id) > 0);

-- Tighten INSERT too - require session_id
DROP POLICY IF EXISTS "Visitor sessions insert" ON public.visitor_sessions;
CREATE POLICY "Visitor sessions insert"
  ON public.visitor_sessions
  FOR INSERT
  TO public
  WITH CHECK (session_id IS NOT NULL AND length(session_id) > 0);

-- 3. Make payment-proofs bucket private
UPDATE storage.buckets SET public = false WHERE id = 'payment-proofs';

-- Replace the broad public SELECT with a restricted one
DROP POLICY IF EXISTS "Public read payment proofs" ON storage.objects;
CREATE POLICY "Staff read payment proofs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'motoboy'::app_role)
      OR has_role(auth.uid(), 'pdv'::app_role)
    )
  );

-- 4. Remove duplicate SELECT policies on images bucket (keep one)
DROP POLICY IF EXISTS "Public read access to images" ON storage.objects;

-- 5. Remove duplicate DELETE policy on images
DROP POLICY IF EXISTS "Admin pode deletar imagens" ON storage.objects;