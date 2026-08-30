-- Create drink_fruits table for custom drink builder
CREATE TABLE public.drink_fruits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  price NUMERIC NOT NULL DEFAULT 5.00,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drink_fruits ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Frutas são públicas para leitura"
ON public.drink_fruits
FOR SELECT
USING (true);

-- Admin management
CREATE POLICY "Admin pode gerenciar frutas"
ON public.drink_fruits
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Insert default fruits
INSERT INTO public.drink_fruits (name, price, sort_order) VALUES
('Morango', 5.00, 1),
('Limão', 5.00, 2),
('Laranja', 5.00, 3),
('Maracujá', 5.00, 4),
('Abacaxi', 5.00, 5),
('Kiwi', 5.00, 6),
('Uva', 5.00, 7),
('Melancia', 5.00, 8);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.drink_fruits;