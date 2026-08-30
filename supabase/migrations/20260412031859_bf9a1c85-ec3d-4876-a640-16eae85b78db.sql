INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'log'::app_role
FROM public.user_roles
WHERE role = 'kitchen'
ON CONFLICT (user_id, role) DO NOTHING;