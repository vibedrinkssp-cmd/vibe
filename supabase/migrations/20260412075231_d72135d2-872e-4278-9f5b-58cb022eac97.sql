-- Ensure the images bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public read access to images
CREATE POLICY "Public read access to images"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- Allow authenticated admin/pdv to upload images
CREATE POLICY "Admin/PDV can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'pdv'::public.app_role)
  )
);

-- Allow authenticated admin to delete images
CREATE POLICY "Admin can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admin/pdv to update images
CREATE POLICY "Admin/PDV can update images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'pdv'::public.app_role)
  )
);