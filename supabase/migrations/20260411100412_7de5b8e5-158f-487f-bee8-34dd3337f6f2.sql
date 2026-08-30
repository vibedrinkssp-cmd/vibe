
-- Allow kitchen role to update drink_fruits (specifically is_active toggle)
CREATE POLICY "Kitchen pode ativar/desativar frutas"
ON public.drink_fruits
FOR UPDATE
USING (has_role(auth.uid(), 'kitchen'::app_role))
WITH CHECK (has_role(auth.uid(), 'kitchen'::app_role));
