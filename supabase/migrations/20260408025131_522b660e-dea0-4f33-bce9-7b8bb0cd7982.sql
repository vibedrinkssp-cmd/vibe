ALTER TABLE public.orders ADD COLUMN payment_confirmed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN payment_confirmed_at timestamp with time zone DEFAULT null;
ALTER TABLE public.orders ADD COLUMN payment_confirmed_by text DEFAULT null;