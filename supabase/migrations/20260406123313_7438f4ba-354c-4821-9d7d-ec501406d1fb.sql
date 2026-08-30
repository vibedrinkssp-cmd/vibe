
-- Table to store which products (bottles) are allowed per drink config
CREATE TABLE public.special_drink_allowed_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.special_drink_configs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(config_id, product_id)
);

-- RLS
ALTER TABLE public.special_drink_allowed_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage allowed products"
  ON public.special_drink_allowed_products FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public read allowed products"
  ON public.special_drink_allowed_products FOR SELECT
  TO public
  USING (true);
