
DROP FUNCTION IF EXISTS public.register_customer(text,text,text,text,text,text,text,text,text,text,text,double precision,double precision);

CREATE OR REPLACE FUNCTION public.register_customer(
    p_name TEXT,
    p_whatsapp TEXT,
    p_cpf TEXT,
    p_street TEXT DEFAULT '',
    p_number TEXT DEFAULT '',
    p_complement TEXT DEFAULT NULL,
    p_neighborhood TEXT DEFAULT '',
    p_city TEXT DEFAULT 'São Paulo',
    p_state TEXT DEFAULT 'SP',
    p_zip_code TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_latitude DOUBLE PRECISION DEFAULT NULL,
    p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id UUID;
    new_address_id UUID;
    existing_user RECORD;
    existing_cpf RECORD;
    raw_password TEXT;
    final_password TEXT;
    salt TEXT;
BEGIN
    SELECT * INTO existing_user FROM users WHERE whatsapp = p_whatsapp;
    IF existing_user IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'WhatsApp já cadastrado');
    END IF;

    SELECT * INTO existing_cpf FROM users WHERE cpf = p_cpf;
    IF existing_cpf IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'CPF já cadastrado');
    END IF;

    raw_password := substring(p_cpf from 1 for 4);
    salt := gen_random_uuid()::TEXT;
    final_password := 'sha256:' || salt || ':' || encode(extensions.digest((raw_password || salt)::bytea, 'sha256'), 'hex');

    INSERT INTO users (name, whatsapp, cpf, password, is_blocked, requires_password_change)
    VALUES (p_name, p_whatsapp, p_cpf, final_password, false, false)
    RETURNING id INTO new_user_id;

    INSERT INTO user_roles (user_id, role)
    VALUES (new_user_id, 'customer');

    INSERT INTO addresses (user_id, street, number, complement, neighborhood, city, state, zip_code, notes, latitude, longitude, is_default)
    VALUES (new_user_id, p_street, p_number, p_complement, p_neighborhood, p_city, p_state, p_zip_code, p_notes, p_latitude, p_longitude, true)
    RETURNING id INTO new_address_id;

    RETURN json_build_object(
        'success', true,
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
$$;
