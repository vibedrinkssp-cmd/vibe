
UPDATE products SET product_type = 'energetico' 
WHERE category_id = 'f75e5c39-62ea-45c6-b9ee-1f956bc5240a';

UPDATE products SET product_type = 'destilado' 
WHERE category_id IN (
  'f95887ce-ef6c-4ff4-83ae-10e2a86602c0',
  'eba92dd6-a457-4536-837a-f4c7eb95b318',
  '90242037-316f-48e4-a7a5-8d920f4bfaa9',
  '05383271-1423-4eb1-a0f1-5b4410f4b072',
  '0167dac7-d26a-4c8c-ba9f-5d9b55059614'
);

UPDATE products SET product_type = 'gelo' 
WHERE category_id = 'd5f35a3c-f9df-4160-8b53-8b8cea0d3306';

UPDATE products SET product_type = 'ice' 
WHERE category_id = '8e030d4d-ec1f-4722-8b68-0f0f93c13971';

UPDATE products SET product_type = 'venda' 
WHERE product_type IS NULL;
