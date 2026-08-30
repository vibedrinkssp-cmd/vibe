
-- 1. Fix order_items INSERT already done in previous migration (it succeeded partially)
-- The policy was already dropped and recreated

-- 2. Fix storage: drop permissive policies and create restricted ones
DROP POLICY IF EXISTS "Permite upload de imagens" ON storage.objects;
DROP POLICY IF EXISTS "Permite atualizar imagens" ON storage.objects;

CREATE POLICY "Staff pode upload imagens"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role))
);

CREATE POLICY "Staff pode atualizar imagens"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role))
);
