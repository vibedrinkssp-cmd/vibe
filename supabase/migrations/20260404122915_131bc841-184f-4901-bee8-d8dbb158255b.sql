
-- Create totem user
INSERT INTO public.users (name, whatsapp, password)
VALUES ('Totem 01', 'totem01', 'totem93')
ON CONFLICT DO NOTHING;

-- Assign pdv role to totem user so it can create orders
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'pdv'::app_role
FROM public.users u
WHERE u.whatsapp = 'totem01'
ON CONFLICT (user_id, role) DO NOTHING;
