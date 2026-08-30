-- Criar novas categorias necessárias para importação
INSERT INTO categories (name, is_special, is_active, sort_order) VALUES
-- Categorias de bebidas prontas (não especiais)
('ICES', false, true, 30),
('ÁGUA', false, true, 31),
('GELOS', false, true, 32),
('CACHAÇAS', false, true, 33),
('DIVERSOS', false, true, 34),
('DOCES', false, true, 35),
('SALGADINHOS', false, true, 36),

-- Categorias de combos (não especiais, são kits)
('COMBOS GIN', false, true, 40),
('COMBOS VODKA', false, true, 41),
('COMBOS WHISKY', false, true, 42),

-- Categorias especiais (preparadas na hora)
('DRINKS 43', true, true, 50),
('DRINKS GOURMET', true, true, 51),
('BATIDAS KIDS 0%', true, true, 52),
('CAIPI ICE', true, true, 53),
('COPÃO GIN', true, true, 54),
('COPÃO VODKA', true, true, 55),
('COPÃO WHISKY', true, true, 56),
('COROTES DRINKS', true, true, 57)
ON CONFLICT DO NOTHING;

-- Criar função RPC para importação em massa de produtos
CREATE OR REPLACE FUNCTION import_products_batch(
  p_products JSONB
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product JSONB;
  v_count INTEGER := 0;
  v_category_id UUID;
BEGIN
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    -- Buscar categoria pelo nome
    SELECT id INTO v_category_id
    FROM categories
    WHERE UPPER(TRIM(name)) = UPPER(TRIM(v_product->>'category_name'));
    
    -- Inserir ou atualizar produto
    INSERT INTO products (
      name,
      description,
      sale_price,
      cost_price,
      profit_margin,
      stock,
      is_active,
      is_prepared,
      category_id
    ) VALUES (
      TRIM(v_product->>'name'),
      NULLIF(TRIM(v_product->>'description'), 'Produto de qualidade'),
      (v_product->>'sale_price')::NUMERIC,
      0,
      0,
      10,
      (v_product->>'is_active')::BOOLEAN,
      (v_product->>'is_prepared')::BOOLEAN,
      v_category_id
    )
    ON CONFLICT DO NOTHING;
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;