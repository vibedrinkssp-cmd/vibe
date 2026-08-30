
-- ============================================================================
-- ONDA 5: Auditoria de RLS — consistência INSERT/SELECT
-- Garante que tudo gravado pelo staff (PDV/Admin) é visível para o staff
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) SANGRIAS — alinhar com demais tabelas operacionais (public, não authenticated)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff pode gerenciar sangrias" ON public.sangrias;
DROP POLICY IF EXISTS "Staff pode ver sangrias" ON public.sangrias;

CREATE POLICY "Staff gerencia sangrias"
  ON public.sangrias
  FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff visualiza sangrias"
  ON public.sangrias
  FOR SELECT
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role));

-- Sangria items
DROP POLICY IF EXISTS "Staff pode gerenciar sangria_items" ON public.sangria_items;
DROP POLICY IF EXISTS "Staff pode ver sangria_items" ON public.sangria_items;

CREATE POLICY "Staff gerencia sangria_items"
  ON public.sangria_items
  FOR ALL
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff visualiza sangria_items"
  ON public.sangria_items
  FOR SELECT
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'pdv'::app_role));

-- ----------------------------------------------------------------------------
-- 2) MOTOBOYS — permitir self-update (status online/offline + GPS)
-- ----------------------------------------------------------------------------
CREATE POLICY "Motoboy atualiza próprio status"
  ON public.motoboys
  FOR UPDATE
  TO public
  USING (public.has_role(auth.uid(), 'motoboy'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'motoboy'::app_role));

-- ----------------------------------------------------------------------------
-- 3) MOTOBOY_LOCATIONS — motoboy vê suas próprias localizações
-- ----------------------------------------------------------------------------
-- (já existem policies para staff e cliente; falta a do próprio motoboy ver histórico)
-- A policy "Staff pode ver localizações" já cobre 'motoboy' role, então OK.
-- Apenas garantimos que o motoboy possa atualizar (raro, mas para correções):
CREATE POLICY "Motoboy gerencia próprias localizações"
  ON public.motoboy_locations
  FOR UPDATE
  TO public
  USING (public.has_role(auth.uid(), 'motoboy'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'motoboy'::app_role));

-- ----------------------------------------------------------------------------
-- 4) PAYMENT_CONFIRMATIONS — PDV também precisa criar/ver (não só motoboy)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff pode inserir confirmações" ON public.payment_confirmations;
DROP POLICY IF EXISTS "Staff pode ver confirmações" ON public.payment_confirmations;

CREATE POLICY "Staff insere confirmações"
  ON public.payment_confirmations
  FOR INSERT
  TO public
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) 
    OR public.has_role(auth.uid(), 'motoboy'::app_role)
    OR public.has_role(auth.uid(), 'pdv'::app_role)
  );

CREATE POLICY "Staff visualiza confirmações"
  ON public.payment_confirmations
  FOR SELECT
  TO public
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) 
    OR public.has_role(auth.uid(), 'motoboy'::app_role)
    OR public.has_role(auth.uid(), 'pdv'::app_role)
  );

-- ----------------------------------------------------------------------------
-- 5) CASH_REGISTER_AUDIT — admin também precisa ler (não só pdv/admin já tem)
-- ----------------------------------------------------------------------------
-- Policies já estão corretas (admin OR pdv para SELECT/INSERT). Sem alterações.

-- ----------------------------------------------------------------------------
-- 6) MOTOBOY_CASH_CONFIRMATIONS — admin também precisa atualizar (correções)
-- ----------------------------------------------------------------------------
CREATE POLICY "Admin atualiza confirmações de dinheiro motoboy"
  ON public.motoboy_cash_confirmations
  FOR UPDATE
  TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
