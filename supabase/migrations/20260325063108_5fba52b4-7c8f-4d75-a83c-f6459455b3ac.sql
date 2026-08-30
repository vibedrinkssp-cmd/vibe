UPDATE public.special_drink_configs SET sort_order = 1 WHERE slug = 'caipirinha';
UPDATE public.special_drink_configs SET sort_order = 2 WHERE slug = 'caipi-ice';
UPDATE public.special_drink_configs SET sort_order = 3 WHERE slug = 'copao';
UPDATE public.special_drink_configs SET sort_order = 4 WHERE slug = 'drink-43';
UPDATE public.special_drink_configs SET sort_order = 10 WHERE slug NOT IN ('caipirinha', 'caipi-ice', 'copao', 'drink-43');