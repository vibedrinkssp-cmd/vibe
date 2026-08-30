-- Inserir novas categorias necessárias
INSERT INTO categories (name, is_active, sort_order) VALUES
('SUCOS', true, 100),
('SNACKS', true, 110),
('COMBOS', true, 120),
('ACESSÓRIOS', true, 130),
('TABACARIA', true, 140),
('CIGARROS', true, 150),
('LICOR 43', true, 160)
ON CONFLICT DO NOTHING;