-- Performance indexes for orders table
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_motoboy_id ON public.orders (motoboy_id) WHERE motoboy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_salesperson ON public.orders (salesperson) WHERE salesperson IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);

-- Performance indexes for order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- Performance indexes for visitor_sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_sessions_session_id ON public.visitor_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_active ON public.visitor_sessions (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_visitor_sessions_last_activity ON public.visitor_sessions (last_activity_at);

-- Performance indexes for motoboy_locations
CREATE INDEX IF NOT EXISTS idx_motoboy_locations_motoboy_id ON public.motoboy_locations (motoboy_id, created_at DESC);

-- Performance indexes for products
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products (category_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_active_sort ON public.products (is_active, sort_order) WHERE is_active = true;

-- Performance indexes for categories
CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON public.categories (is_active, sort_order) WHERE is_active = true;

-- Auto-cleanup function for old visitor sessions (older than 24h)
CREATE OR REPLACE FUNCTION public.cleanup_old_visitor_sessions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.visitor_sessions
  WHERE last_activity_at < NOW() - INTERVAL '24 hours';
$$;

-- Auto-cleanup function for old motoboy locations (older than 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_motoboy_locations()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.motoboy_locations
  WHERE created_at < NOW() - INTERVAL '7 days';
$$;