-- Add 'customer' and 'motoboy' to app_role enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'customer' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'customer';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'motoboy' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'motoboy';
  END IF;
END $$;

-- Backfill: assign 'motoboy' role to users who exist in the motoboys table but have no user_roles entry
-- We match by whatsapp since motoboys table has its own IDs
-- (This handles the case where motoboy users were created in public.users)
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'motoboy'::app_role
FROM public.users u
INNER JOIN public.motoboys m ON m.whatsapp = u.whatsapp
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill: assign 'customer' role to remaining users without any role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'customer'::app_role
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;