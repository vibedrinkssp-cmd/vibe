-- Add product tier enum
CREATE TYPE public.product_tier AS ENUM ('essencial', 'premium', 'luxo');

-- Add tier column to products
ALTER TABLE public.products
ADD COLUMN tier public.product_tier NULL DEFAULT NULL;