-- Achado crítico da auditoria: deduct_bottle_doses e return_bottle_doses não
-- checavam quem estava chamando. Como rodam com a anon key (pública, embutida
-- no bundle do site), qualquer visitante podia abrir o console do navegador e
-- chamar a RPC diretamente com valores arbitrários, zerando o controle de
-- qualquer garrafa aberta sem nunca ter feito um pedido.
--
-- Segue o mesmo padrão já usado em outras funções sensíveis deste projeto
-- (ex.: verify_panel_password_v2, get_kitchen_orders_complete): revoga o
-- EXECUTE público e deixa a função acessível só via service_role, chamada
-- pela edge function bottle-doses (que valida e limita os valores antes de
-- executar). PDV, Cozinha e o site do cliente passam a chamar essa edge
-- function em vez da RPC diretamente.
REVOKE EXECUTE ON FUNCTION public.deduct_bottle_doses(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.return_bottle_doses(uuid, integer) FROM PUBLIC, anon, authenticated;
