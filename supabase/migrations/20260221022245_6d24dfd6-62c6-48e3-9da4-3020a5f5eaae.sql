
ALTER TABLE public.special_drink_configs
ADD COLUMN step_ice boolean NOT NULL DEFAULT false;

-- Enable it for the caipi-ice config
UPDATE public.special_drink_configs
SET step_ice = true
WHERE slug = 'caipi-ice';
