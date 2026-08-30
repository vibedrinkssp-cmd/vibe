
-- 1. Backfill category_id for orphan products by name keywords
UPDATE products SET category_id = '0167dac7-d26a-4c8c-ba9f-5d9b55059614' -- LICORES
WHERE category_id IS NULL AND (
  name ILIKE '%LICOR%' OR name ILIKE '%AMARULA%' OR name ILIKE '%DOLCE%'
);

UPDATE products SET category_id = '05383271-1423-4eb1-a0f1-5b4410f4b072' -- WHISKYS
WHERE category_id IS NULL AND name ILIKE '%ROYAL SALUTE%';

UPDATE products SET category_id = 'f95887ce-ef6c-4ff4-83ae-10e2a86602c0' -- CACHAÇAS
WHERE category_id IS NULL AND (name ILIKE '%CANELINHA%' OR name ILIKE '%CACHAÇA%' OR name ILIKE '%CACHACA%');

UPDATE products SET category_id = 'be6235f5-7bc1-4273-9a0c-f6600c366ba8' -- DOCES
WHERE category_id IS NULL AND (name ILIKE '%CHICLETE%' OR name ILIKE '%CHOCOLATE%' OR name ILIKE '%BALA%');

UPDATE products SET category_id = 'c6e664bb-cfbf-44e8-a2e5-8be26381c0e6' -- TABACARIA E CIGARROS
WHERE category_id IS NULL AND (name ILIKE '%SEDA%' OR name ILIKE '%NARGUILE%' OR name ILIKE '%NARGUILÉ%' OR name ILIKE '%CIGARRO%' OR name ILIKE '%CARVÃO%');

UPDATE products SET category_id = 'ec0daf7d-b334-42a9-8e4a-1053ec238cf9' -- SALGADINHOS
WHERE category_id IS NULL AND (name ILIKE '%QUEIJINHO%' OR name ILIKE '%FRITIZ%' OR name ILIKE '%BACONZITOS%' OR name ILIKE '%BISCOITO%');

UPDATE products SET category_id = '71c8cd13-cdbc-4e36-8786-b02cb531fdbd' -- DIVERSOS (fallback)
WHERE category_id IS NULL AND is_active = true;

-- 2. Backfill product_type from category for products with NULL/empty type
WITH category_to_type AS (
  SELECT * FROM (VALUES
    ('0167dac7-d26a-4c8c-ba9f-5d9b55059614'::uuid, 'licor'),
    ('05383271-1423-4eb1-a0f1-5b4410f4b072'::uuid, 'whisky'),
    ('90242037-316f-48e4-a7a5-8d920f4bfaa9'::uuid, 'vodka'),
    ('eba92dd6-a457-4536-837a-f4c7eb95b318'::uuid, 'gin'),
    ('aa915001-7490-4ff8-beaf-280c1301ec44'::uuid, 'destilado'),
    ('f95887ce-ef6c-4ff4-83ae-10e2a86602c0'::uuid, 'cachaca'),
    ('85d1c376-446f-4307-a732-8423afc12254'::uuid, 'vinho'),
    ('64eb629d-a734-47f7-ae5b-68f5815ac2e9'::uuid, 'espumante'),
    ('910004ea-3a2c-4f2e-85a5-e94d00ebd3ab'::uuid, 'cerveja'),
    ('f75e5c39-62ea-45c6-b9ee-1f956bc5240a'::uuid, 'energetico'),
    ('8e030d4d-ec1f-4722-8b68-0f0f93c13971'::uuid, 'ice'),
    ('6c51ac88-0a10-4c2f-9029-d2cb1dcc5057'::uuid, 'corote'),
    ('fa5d5fa6-bf51-495d-9313-44093d264d55'::uuid, 'refrigerante'),
    ('3bb6f64a-7e6a-4241-83b9-9b4da9b7e0dc'::uuid, 'suco'),
    ('ff47ee79-91c2-4833-acda-0c781943a015'::uuid, 'suco'),
    ('67938319-c6d8-48e4-85d7-d25fb128c7f7'::uuid, 'suco_natural'),
    ('44cee043-5a56-4bcd-8374-93862e9c161a'::uuid, 'agua'),
    ('01d822d9-640e-41a8-a56c-86e64490ece6'::uuid, 'isotonico'),
    ('d5f35a3c-f9df-4160-8b53-8b8cea0d3306'::uuid, 'gelo'),
    ('be6235f5-7bc1-4273-9a0c-f6600c366ba8'::uuid, 'doce'),
    ('ec0daf7d-b334-42a9-8e4a-1053ec238cf9'::uuid, 'salgadinho'),
    ('df85ad2d-e075-497e-8a8d-49f8d6b42d5b'::uuid, 'salgado'),
    ('467880ba-3de6-4942-bb45-ffd9b588090e'::uuid, 'lanche'),
    ('81056910-4538-4ced-bd44-4b23de11d5f5'::uuid, 'hamburguer'),
    ('060f984d-c430-4ed6-a60e-a5017e06dba9'::uuid, 'drink_especial'),
    ('c6e664bb-cfbf-44e8-a2e5-8be26381c0e6'::uuid, 'tabacaria'),
    ('71c8cd13-cdbc-4e36-8786-b02cb531fdbd'::uuid, 'diversos')
  ) AS t(category_id, product_type)
)
UPDATE products p
SET product_type = ct.product_type
FROM category_to_type ct
WHERE p.category_id = ct.category_id
  AND (p.product_type IS NULL OR p.product_type = '');

-- 3. Trigger to auto-fill product_type from category when missing
CREATE OR REPLACE FUNCTION public.auto_fill_product_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.product_type IS NULL OR NEW.product_type = '') AND NEW.category_id IS NOT NULL THEN
    SELECT CASE NEW.category_id
      WHEN '0167dac7-d26a-4c8c-ba9f-5d9b55059614'::uuid THEN 'licor'
      WHEN '05383271-1423-4eb1-a0f1-5b4410f4b072'::uuid THEN 'whisky'
      WHEN '90242037-316f-48e4-a7a5-8d920f4bfaa9'::uuid THEN 'vodka'
      WHEN 'eba92dd6-a457-4536-837a-f4c7eb95b318'::uuid THEN 'gin'
      WHEN 'aa915001-7490-4ff8-beaf-280c1301ec44'::uuid THEN 'destilado'
      WHEN 'f95887ce-ef6c-4ff4-83ae-10e2a86602c0'::uuid THEN 'cachaca'
      WHEN '85d1c376-446f-4307-a732-8423afc12254'::uuid THEN 'vinho'
      WHEN '64eb629d-a734-47f7-ae5b-68f5815ac2e9'::uuid THEN 'espumante'
      WHEN '910004ea-3a2c-4f2e-85a5-e94d00ebd3ab'::uuid THEN 'cerveja'
      WHEN 'f75e5c39-62ea-45c6-b9ee-1f956bc5240a'::uuid THEN 'energetico'
      WHEN '8e030d4d-ec1f-4722-8b68-0f0f93c13971'::uuid THEN 'ice'
      WHEN '6c51ac88-0a10-4c2f-9029-d2cb1dcc5057'::uuid THEN 'corote'
      WHEN 'fa5d5fa6-bf51-495d-9313-44093d264d55'::uuid THEN 'refrigerante'
      WHEN '3bb6f64a-7e6a-4241-83b9-9b4da9b7e0dc'::uuid THEN 'suco'
      WHEN 'ff47ee79-91c2-4833-acda-0c781943a015'::uuid THEN 'suco'
      WHEN '67938319-c6d8-48e4-85d7-d25fb128c7f7'::uuid THEN 'suco_natural'
      WHEN '44cee043-5a56-4bcd-8374-93862e9c161a'::uuid THEN 'agua'
      WHEN '01d822d9-640e-41a8-a56c-86e64490ece6'::uuid THEN 'isotonico'
      WHEN 'd5f35a3c-f9df-4160-8b53-8b8cea0d3306'::uuid THEN 'gelo'
      WHEN 'be6235f5-7bc1-4273-9a0c-f6600c366ba8'::uuid THEN 'doce'
      WHEN 'ec0daf7d-b334-42a9-8e4a-1053ec238cf9'::uuid THEN 'salgadinho'
      WHEN 'df85ad2d-e075-497e-8a8d-49f8d6b42d5b'::uuid THEN 'salgado'
      WHEN '467880ba-3de6-4942-bb45-ffd9b588090e'::uuid THEN 'lanche'
      WHEN '81056910-4538-4ced-bd44-4b23de11d5f5'::uuid THEN 'hamburguer'
      WHEN '060f984d-c430-4ed6-a60e-a5017e06dba9'::uuid THEN 'drink_especial'
      WHEN 'c6e664bb-cfbf-44e8-a2e5-8be26381c0e6'::uuid THEN 'tabacaria'
      WHEN '71c8cd13-cdbc-4e36-8786-b02cb531fdbd'::uuid THEN 'diversos'
      ELSE NEW.product_type
    END INTO NEW.product_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_product_type ON public.products;
CREATE TRIGGER trg_auto_fill_product_type
BEFORE INSERT OR UPDATE OF category_id, product_type ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.auto_fill_product_type();
