
-- Fix FK constraints that block product deletion

-- caderneta_entries: set product_id to NULL on delete
ALTER TABLE caderneta_entries DROP CONSTRAINT IF EXISTS caderneta_entries_product_id_fkey;
ALTER TABLE caderneta_entries ADD CONSTRAINT caderneta_entries_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- platform_sales: set product_id to NULL on delete
ALTER TABLE platform_sales DROP CONSTRAINT IF EXISTS platform_sales_product_id_fkey;
ALTER TABLE platform_sales ADD CONSTRAINT platform_sales_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- open_packs: cascade delete (if product is deleted, open packs are removed)
ALTER TABLE open_packs DROP CONSTRAINT IF EXISTS open_packs_product_id_fkey;
ALTER TABLE open_packs ADD CONSTRAINT open_packs_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- sangria_items: set product_id to NULL on delete
ALTER TABLE sangria_items DROP CONSTRAINT IF EXISTS sangria_items_product_id_fkey;
ALTER TABLE sangria_items ADD CONSTRAINT sangria_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- coupons: set product_id to NULL on delete  
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_product_id_fkey;
ALTER TABLE coupons ADD CONSTRAINT coupons_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- special_drink_recipes ingredient: set to NULL on delete
ALTER TABLE special_drink_recipes DROP CONSTRAINT IF EXISTS special_drink_recipes_ingredient_product_id_fkey;
ALTER TABLE special_drink_recipes ADD CONSTRAINT special_drink_recipes_ingredient_product_id_fkey
  FOREIGN KEY (ingredient_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- Update delete_product function to be more robust
CREATE OR REPLACE FUNCTION delete_product(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete related special drink recipes where this is the main product
  DELETE FROM special_drink_recipes WHERE product_id = p_id;
  -- Delete related special drink allowed products
  DELETE FROM special_drink_allowed_products WHERE product_id = p_id;
  -- Now delete the product (other FKs will SET NULL or CASCADE)
  DELETE FROM products WHERE id = p_id;
END;
$$;
