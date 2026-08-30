-- 1) Converter a garrafa duplicada ROSA (cheia, 10/10) em INTENCION TRADICIONAL/SECO
UPDATE public.open_bottles
   SET product_id = '59efacee-e8ec-4a39-9e06-928ea67b92a4',
       product_name = 'GIN INTENCION TRADICIONAL 1L'
 WHERE id = 'c73a42c9-5a3a-4b69-83dc-3a89853be010'
   AND product_id = '42bbf6d5-c95b-4f05-b2c3-7c777ce05943';

-- 2) Marcar como vazia a garrafa duplicada de MASTER GOLD (2/10, mais recente)
UPDATE public.open_bottles
   SET is_empty = true,
       remaining_doses = 0,
       emptied_at = now(),
       notes = COALESCE(notes, '') || ' [auto: duplicada removida em ' || now()::text || ']'
 WHERE id = '312753e3-226d-4a86-bc13-d50777886e5b'
   AND is_empty = false;

-- 3) Trava: impede 2 garrafas ATIVAS (não vazias) do mesmo produto
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_open_bottle_per_product
  ON public.open_bottles (product_id)
  WHERE is_empty = false;