-- Permitir upload de comprovantes de pagamento pelo painel do motoboy (auth própria = anon)
DROP POLICY IF EXISTS "Staff upload payment proofs" ON storage.objects;
CREATE POLICY "Anyone can upload payment proofs"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

-- Permitir leitura dos comprovantes (painel admin usa client anon com auth própria)
DROP POLICY IF EXISTS "Staff read payment proofs" ON storage.objects;
CREATE POLICY "Anyone can read payment proofs"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'payment-proofs');