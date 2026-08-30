
ALTER TABLE public.special_drink_configs
  ADD COLUMN step_adicionais boolean NOT NULL DEFAULT false,
  ADD COLUMN max_adicionais integer NOT NULL DEFAULT 3,
  ADD COLUMN adicional_price numeric NOT NULL DEFAULT 5.00;
