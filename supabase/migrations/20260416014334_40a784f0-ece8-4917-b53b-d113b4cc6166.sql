
-- Tabela de maços de cigarro abertos
CREATE TABLE public.open_packs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text NOT NULL,
  pack_size integer NOT NULL DEFAULT 20,
  remaining_units integer NOT NULL,
  is_empty boolean NOT NULL DEFAULT false,
  opened_at timestamptz NOT NULL DEFAULT now(),
  emptied_at timestamptz,
  opened_by text,
  notes text
);

ALTER TABLE public.open_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff pode gerenciar open_packs"
  ON public.open_packs FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

CREATE POLICY "Staff pode ver open_packs"
  ON public.open_packs FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pdv'::app_role) OR has_role(auth.uid(), 'kitchen'::app_role));

-- Função para listar maços abertos
CREATE OR REPLACE FUNCTION public.get_open_packs()
RETURNS SETOF public.open_packs
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.open_packs ORDER BY is_empty ASC, opened_at DESC;
$$;

-- Função para abrir um maço (deduz 1 do estoque)
CREATE OR REPLACE FUNCTION public.open_cigarette_pack(
  p_product_id uuid,
  p_pack_size integer DEFAULT 20,
  p_opened_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_product_name text;
  v_stock integer;
BEGIN
  SELECT name, stock INTO v_product_name, v_stock FROM products WHERE id = p_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_stock IS NULL OR v_stock < 1 THEN
    RAISE EXCEPTION 'Estoque insuficiente para abrir maço';
  END IF;

  -- Deduz 1 do estoque (1 maço)
  UPDATE products SET stock = stock - 1 WHERE id = p_product_id;

  INSERT INTO open_packs (product_id, product_name, pack_size, remaining_units, opened_by, notes)
  VALUES (p_product_id, v_product_name, p_pack_size, p_pack_size, p_opened_by, p_notes)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Função para descontar 1 cigarro solto de um maço aberto pelo nome do produto
CREATE OR REPLACE FUNCTION public.deduct_cigarette(p_product_name text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack_id uuid;
BEGIN
  -- Pega o maço mais antigo que ainda tem cigarros
  SELECT id INTO v_pack_id
  FROM open_packs
  WHERE product_name = p_product_name AND is_empty = false AND remaining_units > 0
  ORDER BY opened_at ASC
  LIMIT 1;

  IF v_pack_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE open_packs
  SET remaining_units = remaining_units - 1,
      is_empty = CASE WHEN remaining_units - 1 <= 0 THEN true ELSE false END,
      emptied_at = CASE WHEN remaining_units - 1 <= 0 THEN now() ELSE NULL END
  WHERE id = v_pack_id;

  RETURN true;
END;
$$;
