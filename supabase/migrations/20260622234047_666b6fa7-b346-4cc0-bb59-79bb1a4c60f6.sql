CREATE TABLE public.pager_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pager_ads TO anon, authenticated;
GRANT ALL ON public.pager_ads TO service_role;

ALTER TABLE public.pager_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active pager ads"
ON public.pager_ads FOR SELECT
USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pager_ads;
ALTER TABLE public.pager_ads REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.create_pager_ad(
  p_image_url TEXT,
  p_title TEXT DEFAULT NULL,
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
  INSERT INTO pager_ads (image_url, title, is_active, sort_order)
  VALUES (p_image_url, p_title, p_is_active, p_sort_order)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pager_ad(
  p_id UUID,
  p_title TEXT DEFAULT NULL,
  p_image_url TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_sort_order INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pager_ads
  SET
    title = COALESCE(p_title, title),
    image_url = COALESCE(p_image_url, image_url),
    is_active = COALESCE(p_is_active, is_active),
    sort_order = COALESCE(p_sort_order, sort_order)
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_pager_ad(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM pager_ads WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_pager_ad(TEXT, TEXT, BOOLEAN, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_pager_ad(UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_pager_ad(UUID) TO anon, authenticated, service_role;