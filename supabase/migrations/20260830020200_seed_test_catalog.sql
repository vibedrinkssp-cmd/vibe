-- Dados mínimos de teste para o storefront não ficar vazio ao validar a
-- estrutura do app num projeto Supabase recém-criado.
INSERT INTO public.settings (is_open, delivery_rate_per_km, min_delivery_fee, max_delivery_distance)
SELECT true, 1, 4, 15
WHERE NOT EXISTS (SELECT 1 FROM public.settings);

DO $$
DECLARE
  v_category_id uuid := '00000000-0000-0000-0000-0000000000c1';
BEGIN
  INSERT INTO public.categories (id, name, is_active, sort_order)
  VALUES (v_category_id, 'Cervejas', true, 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.products (id, name, description, cost_price, profit_margin, sale_price, stock, category_id, is_active, sort_order)
  VALUES (
    '00000000-0000-0000-0000-0000000000a1', 'Cerveja Teste 350ml', 'Produto de teste criado durante o setup',
    3, 100, 6, 50, v_category_id, true, 1
  )
  ON CONFLICT (id) DO NOTHING;
END $$;
