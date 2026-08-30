-- Create RPC functions for admin product management (bypasses RLS for custom auth)

-- Function to update a product
CREATE OR REPLACE FUNCTION public.update_product(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_cost_price NUMERIC DEFAULT NULL,
  p_profit_margin NUMERIC DEFAULT NULL,
  p_sale_price NUMERIC DEFAULT NULL,
  p_stock INTEGER DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    category_id = COALESCE(p_category_id, category_id),
    cost_price = COALESCE(p_cost_price, cost_price),
    profit_margin = COALESCE(p_profit_margin, profit_margin),
    sale_price = COALESCE(p_sale_price, sale_price),
    stock = COALESCE(p_stock, stock),
    image_url = COALESCE(p_image_url, image_url),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_id;
END;
$$;

-- Function to create a product
CREATE OR REPLACE FUNCTION public.create_product(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_cost_price NUMERIC DEFAULT 0,
  p_profit_margin NUMERIC DEFAULT 0,
  p_sale_price NUMERIC DEFAULT 0,
  p_stock INTEGER DEFAULT 0,
  p_image_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO products (
    name, description, category_id, cost_price, profit_margin,
    sale_price, stock, image_url, is_active
  ) VALUES (
    p_name, p_description, p_category_id, p_cost_price, p_profit_margin,
    p_sale_price, p_stock, p_image_url, p_is_active
  )
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Function to delete a product
CREATE OR REPLACE FUNCTION public.delete_product(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM products WHERE id = p_id;
END;
$$;

-- Function to update stock only
CREATE OR REPLACE FUNCTION public.update_product_stock(
  p_id UUID,
  p_stock INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE products SET stock = p_stock WHERE id = p_id;
END;
$$;

-- Function to update category
CREATE OR REPLACE FUNCTION public.update_category(
  p_id UUID,
  p_name TEXT DEFAULT NULL,
  p_icon_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_is_special BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE categories
  SET
    name = COALESCE(p_name, name),
    icon_url = COALESCE(p_icon_url, icon_url),
    is_active = COALESCE(p_is_active, is_active),
    is_special = COALESCE(p_is_special, is_special),
    sort_order = COALESCE(p_sort_order, sort_order)
  WHERE id = p_id;
END;
$$;

-- Function to create a category
CREATE OR REPLACE FUNCTION public.create_category(
  p_name TEXT,
  p_icon_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_is_special BOOLEAN DEFAULT FALSE,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO categories (name, icon_url, is_active, is_special, sort_order)
  VALUES (p_name, p_icon_url, p_is_active, p_is_special, p_sort_order)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Function to delete a category
CREATE OR REPLACE FUNCTION public.delete_category(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM categories WHERE id = p_id;
END;
$$;

-- Function to update settings
CREATE OR REPLACE FUNCTION public.update_settings(
  p_is_open BOOLEAN DEFAULT NULL,
  p_delivery_rate_per_km NUMERIC DEFAULT NULL,
  p_min_delivery_fee NUMERIC DEFAULT NULL,
  p_max_delivery_distance NUMERIC DEFAULT NULL,
  p_pix_key TEXT DEFAULT NULL,
  p_store_address TEXT DEFAULT NULL,
  p_store_lat NUMERIC DEFAULT NULL,
  p_store_lng NUMERIC DEFAULT NULL,
  p_opening_hours JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE settings
  SET
    is_open = COALESCE(p_is_open, is_open),
    delivery_rate_per_km = COALESCE(p_delivery_rate_per_km, delivery_rate_per_km),
    min_delivery_fee = COALESCE(p_min_delivery_fee, min_delivery_fee),
    max_delivery_distance = COALESCE(p_max_delivery_distance, max_delivery_distance),
    pix_key = COALESCE(p_pix_key, pix_key),
    store_address = COALESCE(p_store_address, store_address),
    store_lat = COALESCE(p_store_lat, store_lat),
    store_lng = COALESCE(p_store_lng, store_lng),
    opening_hours = COALESCE(p_opening_hours, opening_hours);
END;
$$;

-- Function to update banner
CREATE OR REPLACE FUNCTION public.update_banner(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_link_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE banners
  SET
    title = COALESCE(p_title, title),
    description = COALESCE(p_description, description),
    image_url = COALESCE(p_image_url, image_url),
    link_url = COALESCE(p_link_url, link_url),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order)
  WHERE id = p_id;
END;
$$;

-- Function to create a banner
CREATE OR REPLACE FUNCTION public.create_banner(
  p_title TEXT,
  p_image_url TEXT,
  p_description TEXT DEFAULT NULL,
  p_link_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT TRUE,
  p_sort_order INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO banners (title, description, image_url, link_url, is_active, sort_order)
  VALUES (p_title, p_description, p_image_url, p_link_url, p_is_active, p_sort_order)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Function to delete a banner
CREATE OR REPLACE FUNCTION public.delete_banner(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM banners WHERE id = p_id;
END;
$$;