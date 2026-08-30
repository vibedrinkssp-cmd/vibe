
-- Update verify_user_password to handle both formats: "salt:hash" and "sha256:salt:hash"
CREATE OR REPLACE FUNCTION public.verify_user_password(p_user_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    stored_password TEXT;
    hash_parts TEXT[];
    computed_hash TEXT;
    salt TEXT;
BEGIN
    SELECT password INTO stored_password FROM users WHERE id = p_user_id;
    
    IF stored_password IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Format: sha256:salt:hash (legacy format)
    IF stored_password LIKE 'sha256:%' THEN
        hash_parts := string_to_array(stored_password, ':');
        IF array_length(hash_parts, 1) = 3 THEN
            computed_hash := encode(extensions.digest((hash_parts[2] || p_password)::bytea, 'sha256'), 'hex');
            RETURN computed_hash = hash_parts[3];
        END IF;
    -- Format: salt:hash (new format from hash_password)
    ELSIF stored_password LIKE '%:%' AND NOT stored_password LIKE '$2%' THEN
        hash_parts := string_to_array(stored_password, ':');
        IF array_length(hash_parts, 1) = 2 THEN
            salt := hash_parts[1];
            computed_hash := encode(extensions.digest((salt || p_password)::bytea, 'sha256'), 'hex');
            RETURN computed_hash = hash_parts[2];
        END IF;
    -- Bcrypt verification
    ELSIF stored_password LIKE '$2%' THEN
        RETURN stored_password = crypt(p_password, stored_password);
    -- Plain text fallback (legacy)
    ELSE
        RETURN stored_password = p_password;
    END IF;
    
    RETURN FALSE;
END;
$$;
