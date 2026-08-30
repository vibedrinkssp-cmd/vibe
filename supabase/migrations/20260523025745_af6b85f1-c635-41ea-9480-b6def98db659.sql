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
    new_user_id UUID;
    new_address_id UUID;
    existing_user RECORD;
    raw_password TEXT;
    final_password TEXT;
    salt TEXT;
BEGIN
    -- CPF tem prioridade: se já existe, reutiliza o cliente para não impedir o pedido
    IF COALESCE(p_cpf, '') <> '' THEN
        SELECT * INTO existing_user FROM users WHERE cpf = p_cpf LIMIT 1;
    END IF;

    -- Se CPF não encontrou, tenta WhatsApp existente
    IF existing_user IS NULL THEN
        SELECT * INTO existing_user FROM users WHERE whatsapp = p_whatsapp LIMIT 1;
    END IF;

    IF existing_user IS NOT NULL THEN
        new_user_id := existing_user.id;

        -- Garante role customer
        INSERT INTO user_roles (user_id, role)
        VALUES (new_user_id, 'customer')
        ON CONFLICT DO NOTHING;

        -- Completa CPF se o cadastro antigo ainda não tinha CPF salvo
        IF COALESCE(existing_user.cpf, '') = '' AND COALESCE(p_cpf, '') <> '' THEN
            UPDATE users
            SET cpf = p_cpf
            WHERE id = new_user_id
              AND cpf IS NULL;
        END IF;

        -- Desmarca endereços padrão antigos e adiciona o novo como padrão
        IF COALESCE(p_street, '') <> '' OR COALESCE(p_number, '') <> '' OR COALESCE(p_neighborhood, '') <> '' THEN
            UPDATE addresses SET is_default = false WHERE user_id = new_user_id;
            INSERT INTO addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
            VALUES (new_user_id, p_street, p_number, p_complement, p_neighborhood, p_city, p_state, p_zip_code, p_notes, p_latitude, p_longitude, true)
            RETURNING id INTO new_address_id;
        ELSE
            SELECT id INTO new_address_id FROM addresses WHERE user_id = new_user_id AND is_default = true LIMIT 1;
        END IF;

        RETURN json_build_object(
            'success', true,
            'reused', true,
            'user', json_build_object(
                'id', existing_user.id,
                'name', existing_user.name,
                'whatsapp', existing_user.whatsapp,
                'role', 'customer'
            ),
            'address', json_build_object(
                'id', new_address_id,
                'userId', new_user_id,
                'street', p_street,
                'number', p_number,
                'complement', p_complement,
                'neighborhood', p_neighborhood,
                'city', p_city,
                'state', p_state,
                'zipCode', p_zip_code,
                'notes', p_notes,
                'latitude', p_latitude,
                'longitude', p_longitude,
                'isDefault', true
            )
        );
    END IF;

    raw_password := substring(p_cpf from 1 for 4);
    salt := gen_random_uuid()::TEXT;
    final_password := 'sha256:' || salt || ':' || encode(extensions.digest((raw_password || salt)::bytea, 'sha256'), 'hex');

    INSERT INTO users (name, whatsapp, cpf, password, is_blocked, requires_password_change)
    VALUES (p_name, p_whatsapp, p_cpf, final_password, false, false)
    RETURNING id INTO new_user_id;

    INSERT INTO user_roles (user_id, role)
    VALUES (new_user_id, 'customer')
    ON CONFLICT DO NOTHING;

    INSERT INTO addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
    VALUES (new_user_id, p_street, p_number, p_complement, p_neighborhood, p_city, p_state, p_zip_code, p_notes, p_latitude, p_longitude, true)
    RETURNING id INTO new_address_id;

    RETURN json_build_object(
        'success', true,
        'reused', false,
        'user', json_build_object(
            'id', new_user_id,
            'name', p_name,
            'whatsapp', p_whatsapp,
            'role', 'customer'
        ),
        'address', json_build_object(
            'id', new_address_id,
            'userId', new_user_id,
            'street', p_street,
            'number', p_number,
            'complement', p_complement,
            'neighborhood', p_neighborhood,
            'city', p_city,
            'state', p_state,
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