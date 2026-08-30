-- Add new columns to coupons table for different coupon types
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS coupon_type TEXT DEFAULT 'percent';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_discount_value NUMERIC DEFAULT NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS product_id UUID DEFAULT NULL REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS category_id UUID DEFAULT NULL REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 1;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;

-- Add comment for coupon_type options
COMMENT ON COLUMN public.coupons.coupon_type IS 'Types: percent, full_discount, caipirinha_dobro, product_specific';

-- Insert template coupons (standard coupons that admin can assign to clients)
INSERT INTO public.coupons (code, discount_percent, coupon_type, description, is_template, is_active)
VALUES 
  ('DESCONTO10', 10, 'percent', '10% de desconto no valor total do carrinho', true, true),
  ('INSTAGRAM100', 100, 'full_discount', '100% de desconto até o valor máximo definido - Para ganhadores de promoções do Instagram', true, true),
  ('CAIPIRINHA2X1', 100, 'caipirinha_dobro', 'Segunda caipirinha grátis - Adicione 2 ou mais caipirinhas ao carrinho', true, true)
ON CONFLICT (code) DO UPDATE SET
  coupon_type = EXCLUDED.coupon_type,
  description = EXCLUDED.description,
  is_template = EXCLUDED.is_template;