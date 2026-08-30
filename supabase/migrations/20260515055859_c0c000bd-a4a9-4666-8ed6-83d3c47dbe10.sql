
-- Etapa 1: ressincronizar nomes existentes
UPDATE open_bottles ob
SET product_name = p.name
FROM products p
WHERE ob.product_id = p.id
  AND ob.product_name <> p.name;

UPDATE open_packs op
SET product_name = p.name
FROM products p
WHERE op.product_id = p.id
  AND op.product_name <> p.name;

-- Etapa 2: trigger BEFORE INSERT/UPDATE em open_bottles para forçar nome do produto
CREATE OR REPLACE FUNCTION public.sync_open_bottle_product_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT name INTO NEW.product_name
    FROM products
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_open_bottle_name ON open_bottles;
CREATE TRIGGER trg_sync_open_bottle_name
BEFORE INSERT OR UPDATE OF product_id ON open_bottles
FOR EACH ROW EXECUTE FUNCTION public.sync_open_bottle_product_name();

-- Mesmo trigger para open_packs
CREATE OR REPLACE FUNCTION public.sync_open_pack_product_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT name INTO NEW.product_name
    FROM products
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_open_pack_name ON open_packs;
CREATE TRIGGER trg_sync_open_pack_name
BEFORE INSERT OR UPDATE OF product_id ON open_packs
FOR EACH ROW EXECUTE FUNCTION public.sync_open_pack_product_name();

-- Etapa 3: trigger AFTER UPDATE OF name em products propaga para garrafas e maços abertos
CREATE OR REPLACE FUNCTION public.propagate_product_name_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE open_bottles SET product_name = NEW.name WHERE product_id = NEW.id;
    UPDATE open_packs   SET product_name = NEW.name WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_product_name ON products;
CREATE TRIGGER trg_propagate_product_name
AFTER UPDATE OF name ON products
FOR EACH ROW EXECUTE FUNCTION public.propagate_product_name_change();
