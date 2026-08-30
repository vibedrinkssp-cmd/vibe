
CREATE OR REPLACE FUNCTION public.update_special_drink_config(p_id uuid, p_updates jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  UPDATE special_drink_configs
  SET
    label = COALESCE(p_updates->>'label', label),
    image_url = COALESCE(p_updates->>'image_url', image_url),
    is_enabled = COALESCE((p_updates->>'is_enabled')::boolean, is_enabled),
    sort_order = COALESCE((p_updates->>'sort_order')::int, sort_order),
    gradient = COALESCE(p_updates->>'gradient', gradient),
    step_doses = COALESCE((p_updates->>'step_doses')::boolean, step_doses),
    step_energetico = COALESCE((p_updates->>'step_energetico')::boolean, step_energetico),
    step_gelo = COALESCE((p_updates->>'step_gelo')::boolean, step_gelo),
    step_frutas = COALESCE((p_updates->>'step_frutas')::boolean, step_frutas),
    step_ice = COALESCE((p_updates->>'step_ice')::boolean, step_ice),
    step_adicionais = COALESCE((p_updates->>'step_adicionais')::boolean, step_adicionais),
    max_doses = COALESCE((p_updates->>'max_doses')::int, max_doses),
    max_frutas = COALESCE((p_updates->>'max_frutas')::int, max_frutas),
    max_adicionais = COALESCE((p_updates->>'max_adicionais')::int, max_adicionais),
    fruit_price = COALESCE((p_updates->>'fruit_price')::numeric, fruit_price),
    adicional_price = COALESCE((p_updates->>'adicional_price')::numeric, adicional_price),
    base_price = COALESCE((p_updates->>'base_price')::numeric, base_price),
    allow_no_alcohol = COALESCE((p_updates->>'allow_no_alcohol')::boolean, allow_no_alcohol),
    updated_at = now()
  WHERE id = p_id;
END;
$$;
