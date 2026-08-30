
ALTER TABLE public.special_drink_configs
ADD COLUMN base_price numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.special_drink_configs.base_price IS 'Preço base do drink montado (antes de somar doses, frutas, etc.)';
