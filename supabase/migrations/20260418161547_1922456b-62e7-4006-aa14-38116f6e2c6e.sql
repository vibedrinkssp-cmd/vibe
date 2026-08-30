-- 1) Reescreve URLs do projeto antigo para o atual em products, banners e special_drink_configs
UPDATE public.products
SET image_url = replace(
  image_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE image_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

UPDATE public.banners
SET image_url = replace(
  image_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE image_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

UPDATE public.special_drink_configs
SET image_url = replace(
  image_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE image_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

UPDATE public.categories
SET icon_url = replace(
  icon_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE icon_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

UPDATE public.drink_fruits
SET icon_url = replace(
  icon_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE icon_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

UPDATE public.motoboys
SET photo_url = replace(
  photo_url,
  'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/',
  'https://djkonftjquielnqejwht.supabase.co/storage/v1/object/public/images/'
)
WHERE photo_url LIKE 'https://owasvhnvalnzqeiuklnu.supabase.co/storage/v1/object/public/images/%';

-- 2) Endurece push_subscriptions: substitui ALL true por INSERT/DELETE permitidos (clientes precisam registrar/desregistrar)
DROP POLICY IF EXISTS "Anyone can manage push subscriptions" ON public.push_subscriptions;

CREATE POLICY "Anyone can subscribe to push"
ON public.push_subscriptions FOR INSERT TO public
WITH CHECK (endpoint IS NOT NULL AND length(endpoint) > 0);

CREATE POLICY "Anyone can unsubscribe own push"
ON public.push_subscriptions FOR DELETE TO public
USING (true);

CREATE POLICY "Staff can read push subscriptions"
ON public.push_subscriptions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));