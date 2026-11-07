-- Migra as fotos de produtos do projeto Supabase antigo (apagado) para o de producao.
-- Pre-requisito: subir a pasta scripts/migrate-images/files/products para Storage > images > products.
-- 1) Produtos cuja foto nao foi recuperada ficam sem foto (aparecem para recadastrar no admin).
UPDATE public.products SET image_url = NULL WHERE id IN ('ce15efbe-3b32-4be8-a4df-61a5df0d9e9f','00feefa1-379f-499f-a61a-7b9f7bd27431','e6375004-12cf-4cbc-a67a-2e44cf5c1a61','e3e0c07b-2ccb-4c58-b976-fc714d0abf56','39e02e6b-0bf0-4ffb-8f9f-d446868c8ca1','7b253fd6-0851-4163-8fb3-05d02b73f6e0','c65562e1-cebd-48c8-b062-20bfdc1593e2','033efe26-02fd-4c7c-8169-cededf9b7265','a9ebc323-c067-47aa-b14f-08f8159c8977','558c39b6-1536-41b6-a106-b8c6624657b5','9b07cd86-849c-474a-934a-d0ae384f2435','65ff2b8c-7519-472e-9251-f3422f3780a0','9295a9ff-d677-4b32-9393-03379c0108bd','2068099b-584c-4e3c-84b2-6bbcbb0e6df0','080e8978-963f-4ebe-ac72-8419a0d8c0a5','b73dfc35-d46c-49b3-aa28-0535a9c4ca9b','47a0c32f-f11a-4702-8bcc-3e826082daa5','f4ecf63a-f997-4df4-893a-08075e8b9575','44ea8591-9733-494a-8280-4de7dfbc7c99','4086d44d-8e28-4213-9707-b31018fd0dca');
-- 2) Demais fotos passam a apontar para o storage de producao (mesmo caminho do arquivo).
UPDATE public.products
SET image_url = replace(image_url, 'https://osuasdneuvcyyscizddu.supabase.co/storage/v1/object/public/', 'https://msbbdwmygabidjngsanv.supabase.co/storage/v1/object/public/')
WHERE image_url LIKE 'https://osuasdneuvcyyscizddu.supabase.co/storage/v1/object/public/%';
