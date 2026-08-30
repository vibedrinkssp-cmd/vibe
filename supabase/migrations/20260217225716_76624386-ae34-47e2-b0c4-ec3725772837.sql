
-- Tabela de clientes da caderneta (fiados)
CREATE TABLE public.caderneta_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caderneta_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode gerenciar caderneta_customers"
ON public.caderneta_customers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode ver caderneta_customers"
ON public.caderneta_customers FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- Tabela de lançamentos da caderneta
CREATE TABLE public.caderneta_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.caderneta_customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  salesperson TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.caderneta_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode gerenciar caderneta_entries"
ON public.caderneta_entries FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

CREATE POLICY "Staff pode ver caderneta_entries"
ON public.caderneta_entries FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role));

-- RPC para criar lançamento na caderneta com baixa de estoque
CREATE OR REPLACE FUNCTION public.create_caderneta_entry(
  p_customer_id UUID,
  p_product_id UUID,
  p_product_name TEXT,
  p_quantity INTEGER,
  p_unit_price NUMERIC,
  p_total_price NUMERIC,
  p_salesperson TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
  v_stock INTEGER;
  v_is_prepared BOOLEAN;
BEGIN
  -- Check stock
  IF p_product_id IS NOT NULL THEN
    SELECT stock, is_prepared INTO v_stock, v_is_prepared FROM products WHERE id = p_product_id;
    
    IF NOT COALESCE(v_is_prepared, false) THEN
      IF v_stock < p_quantity THEN
        RAISE EXCEPTION 'Estoque insuficiente. Disponível: %', v_stock;
      END IF;
      UPDATE products SET stock = stock - p_quantity WHERE id = p_product_id;
    END IF;
  END IF;

  INSERT INTO caderneta_entries (customer_id, product_id, product_name, quantity, unit_price, total_price, salesperson, notes)
  VALUES (p_customer_id, p_product_id, p_product_name, p_quantity, p_unit_price, p_total_price, p_salesperson, p_notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- RPC para marcar como pago
CREATE OR REPLACE FUNCTION public.mark_caderneta_paid(p_entry_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE caderneta_entries SET is_paid = true, paid_at = now() WHERE id = p_entry_id;
END;
$$;

-- RPC para marcar todas as entradas de um cliente como pagas
CREATE OR REPLACE FUNCTION public.mark_caderneta_all_paid(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE caderneta_entries SET is_paid = true, paid_at = now() WHERE customer_id = p_customer_id AND is_paid = false;
END;
$$;

-- Inserir clientes iniciais
INSERT INTO public.caderneta_customers (name) VALUES ('ANDRE'), ('VINICIUS'), ('RAMON');
