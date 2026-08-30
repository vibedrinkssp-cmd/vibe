CREATE OR REPLACE FUNCTION public.get_motoboy_order_users(p_motoboy_id uuid)
 RETURNS TABLE(id uuid, name text, whatsapp text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM motoboys WHERE motoboys.id = p_motoboy_id AND motoboys.is_active = true) THEN
    RAISE EXCEPTION 'Motoboy não encontrado ou inativo';
  END IF;
  RETURN QUERY 
    SELECT DISTINCT u.id, u.name, u.whatsapp 
    FROM users u
    INNER JOIN orders o ON o.user_id = u.id
    WHERE o.motoboy_id = p_motoboy_id;
END;
$function$;