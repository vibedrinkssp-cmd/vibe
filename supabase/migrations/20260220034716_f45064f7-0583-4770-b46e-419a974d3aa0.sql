
-- Remove categorias que não existem
DELETE FROM public.special_drink_configs WHERE slug IN ('energetico', 'gin', 'whisky');

-- Add column for "sem álcool" option
ALTER TABLE public.special_drink_configs ADD COLUMN allow_no_alcohol boolean NOT NULL DEFAULT false;

-- Enable "sem álcool" for all except dose
UPDATE public.special_drink_configs SET allow_no_alcohol = true WHERE slug != 'dose';
