DROP INDEX IF EXISTS public.uniq_active_open_bottle_per_product;

INSERT INTO public.cash_register_audit (action, responsible, notes)
VALUES ('schema_fix', 'SISTEMA', 'Removido índice uniq_active_open_bottle_per_product — permite abrir múltiplas garrafas do mesmo produto');