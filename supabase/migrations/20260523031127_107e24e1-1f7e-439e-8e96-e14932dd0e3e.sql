CREATE OR REPLACE FUNCTION public.register_customer(
    p_name text,
    p_whatsapp text,
    p_cpf text,
    p_street text DEFAULT ''::text,
    p_number text DEFAULT ''::text,
    p_complement text DEFAULT NULL::text,
    p_neighborhood text DEFAULT ''::text,
    p_city text DEFAULT 'São Paulo'::text,
    p_state text DEFAULT 'SP'::text,
    p_zip_code text DEFAULT NULL::text,
    p_notes text DEFAULT NULL::text,
    p_latitude double precision DEFAULT NULL::double precision,
    p_longitude double precision DEFAULT NULL::double precision
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_address_id uuid;
    v_user_name text;
    v_user_whatsapp text;
    v_user_cpf text;
    v_cpf text := NULLIF(regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g'), '');
    v_whatsapp text := NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), '');
    v_raw_password text;
    v_final_password text;
    v_salt text;
BEGIN
    -- 1) Reaproveita primeiro pelo CPF, ignorando pontuação salva anteriormente.
    IF v_cpf IS NOT NULL THEN
        SELECT id, name, whatsapp, cpf
          INTO v_user_id, v_user_name, v_user_whatsapp, v_user_cpf
          FROM public.users
         WHERE regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf
         ORDER BY created_at ASC NULLS LAST
         LIMIT 1;
    END IF;

    -- 2) Se não achou CPF, reaproveita pelo WhatsApp, ignorando pontuação.
    IF v_user_id IS NULL AND v_whatsapp IS NOT NULL THEN
        SELECT id, name, whatsapp, cpf
          INTO v_user_id, v_user_name, v_user_whatsapp, v_user_cpf
          FROM public.users
         WHERE regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') = v_whatsapp
         ORDER BY created_at ASC NULLS LAST
         LIMIT 1;
    END IF;

    -- 3) Se cliente já existe, não tenta criar outro: só garante papel e endereço.
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'customer')
        ON CONFLICT DO NOTHING;

        -- Só completa CPF se estiver vazio e não houver outro cliente usando esse CPF.
        IF NULLIF(COALESCE(v_user_cpf, ''), '') IS NULL AND v_cpf IS NOT NULL THEN
            UPDATE public.users u
               SET cpf = v_cpf
             WHERE u.id = v_user_id
               AND NULLIF(COALESCE(u.cpf, ''), '') IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.users other_u
                    WHERE other_u.id <> v_user_id
                      AND regexp_replace(COALESCE(other_u.cpf, ''), '\D', '', 'g') = v_cpf
               );
        END IF;

        IF COALESCE(p_street, '') <> '' OR COALESCE(p_number, '') <> '' OR COALESCE(p_neighborhood, '') <> '' THEN
            UPDATE public.addresses SET is_default = false WHERE user_id = v_user_id;
            INSERT INTO public.addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
            VALUES (v_user_id, COALESCE(p_street, ''), COALESCE(p_number, ''), p_complement, COALESCE(p_neighborhood, ''), COALESCE(p_city, 'São José dos Campos'), COALESCE(p_state, 'SP'), p_zip_code, p_notes, p_latitude, p_longitude, true)
            RETURNING id INTO v_address_id;
        ELSE
            SELECT id INTO v_address_id FROM public.addresses WHERE user_id = v_user_id AND is_default = true LIMIT 1;
        END IF;

        RETURN json_build_object(
            'success', true,
            'reused', true,
            'user', json_build_object(
                'id', v_user_id,
                'name', COALESCE(v_user_name, p_name),
                'whatsapp', COALESCE(v_user_whatsapp, v_whatsapp, p_whatsapp),
                'role', 'customer'
            ),
            'address', json_build_object(
                'id', v_address_id,
                'userId', v_user_id,
                'street', p_street,
                'number', p_number,
                'complement', p_complement,
                'neighborhood', p_neighborhood,
                'city', COALESCE(p_city, 'São José dos Campos'),
                'state', COALESCE(p_state, 'SP'),
                'zipCode', p_zip_code,
                'notes', p_notes,
                'latitude', p_latitude,
                'longitude', p_longitude,
                'isDefault', true
            )
        );
    END IF;

    -- 4) Cliente realmente novo.
    v_raw_password := substring(COALESCE(v_cpf, '') from 1 for 4);
    v_salt := gen_random_uuid()::text;
    v_final_password := 'sha256:' || v_salt || ':' || encode(extensions.digest((v_raw_password || v_salt)::bytea, 'sha256'), 'hex');

    BEGIN
        INSERT INTO public.users (name, whatsapp, cpf, password, is_blocked, requires_password_change)
        VALUES (p_name, COALESCE(v_whatsapp, p_whatsapp), v_cpf, v_final_password, false, false)
        RETURNING id, name, whatsapp, cpf INTO v_user_id, v_user_name, v_user_whatsapp, v_user_cpf;
    EXCEPTION WHEN unique_violation THEN
        -- Se outra tentativa criou ao mesmo tempo, reaproveita em vez de retornar erro.
        SELECT id, name, whatsapp, cpf
          INTO v_user_id, v_user_name, v_user_whatsapp, v_user_cpf
          FROM public.users
         WHERE (v_cpf IS NOT NULL AND regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf)
            OR (v_whatsapp IS NOT NULL AND regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') = v_whatsapp)
         ORDER BY created_at ASC NULLS LAST
         LIMIT 1;

        IF v_user_id IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Erro ao cadastrar cliente existente');
        END IF;
    END;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'customer')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
    VALUES (v_user_id, COALESCE(p_street, ''), COALESCE(p_number, ''), p_complement, COALESCE(p_neighborhood, ''), COALESCE(p_city, 'São José dos Campos'), COALESCE(p_state, 'SP'), p_zip_code, p_notes, p_latitude, p_longitude, true)
    RETURNING id INTO v_address_id;

    RETURN json_build_object(
        'success', true,
        'reused', false,
        'user', json_build_object(
            'id', v_user_id,
            'name', COALESCE(v_user_name, p_name),
            'whatsapp', COALESCE(v_user_whatsapp, v_whatsapp, p_whatsapp),
            'role', 'customer'
        ),
        'address', json_build_object(
            'id', v_address_id,
            'userId', v_user_id,
            'street', p_street,
            'number', p_number,
            'complement', p_complement,
            'neighborhood', p_neighborhood,
            'city', COALESCE(p_city, 'São José dos Campos'),
            'state', COALESCE(p_state, 'SP'),
            'zipCode', p_zip_code,
            'notes', p_notes,
            'latitude', p_latitude,
            'longitude', p_longitude,
            'isDefault', true
        )
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;