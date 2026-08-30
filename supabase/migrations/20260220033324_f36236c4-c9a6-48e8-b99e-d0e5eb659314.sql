
-- Create updated_at function if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop table if partially created and recreate
DROP TABLE IF EXISTS public.special_drink_configs;

CREATE TABLE public.special_drink_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  image_url text,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  gradient text DEFAULT 'from-purple-500 to-violet-600',
  step_doses boolean NOT NULL DEFAULT true,
  step_energetico boolean NOT NULL DEFAULT false,
  step_gelo boolean NOT NULL DEFAULT true,
  step_frutas boolean NOT NULL DEFAULT true,
  max_doses integer NOT NULL DEFAULT 5,
  max_frutas integer NOT NULL DEFAULT 2,
  fruit_price numeric NOT NULL DEFAULT 5.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.special_drink_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read special_drink_configs"
ON public.special_drink_configs FOR SELECT
USING (true);

CREATE POLICY "Admin manage special_drink_configs"
ON public.special_drink_configs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_special_drink_configs_updated_at
BEFORE UPDATE ON public.special_drink_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.special_drink_configs (slug, label, image_url, is_enabled, sort_order, gradient, step_doses, step_energetico, step_gelo, step_frutas, max_doses, max_frutas, fruit_price) VALUES
('batida', 'Batidas', '/assets/drinks/batida.webp', true, 0, 'from-pink-500 to-rose-600', true, false, true, true, 5, 2, 5.00),
('caipirinha', 'Caipirinhas', '/assets/drinks/caipirinha.webp', true, 1, 'from-lime-500 to-green-600', true, false, true, true, 5, 2, 5.00),
('caipi-ice', 'Caipi Ice', '/assets/drinks/caipi-ice.webp', true, 2, 'from-cyan-400 to-blue-500', true, false, true, true, 5, 2, 5.00),
('dose', 'Doses', '/assets/drinks/dose.webp', true, 3, 'from-amber-500 to-orange-600', true, false, false, false, 5, 0, 5.00),
('drink-43', 'Drinks 43', '/assets/drinks/drink-43.webp', true, 4, 'from-yellow-400 to-amber-500', true, false, true, true, 5, 2, 5.00),
('copao', 'Copão', '/assets/drinks/copao.webp', true, 5, 'from-purple-500 to-violet-600', true, true, true, true, 5, 2, 5.00),
('gin', 'Gin', '/assets/drinks/gin.webp', true, 6, 'from-teal-400 to-emerald-500', true, false, true, true, 5, 2, 5.00),
('whisky', 'Whisky', '/assets/drinks/whisky.webp', true, 7, 'from-orange-500 to-red-600', true, false, true, true, 5, 2, 5.00),
('energetico', 'Energético', '/assets/drinks/energetico.webp', true, 8, 'from-green-400 to-lime-500', false, true, true, true, 0, 2, 5.00);
