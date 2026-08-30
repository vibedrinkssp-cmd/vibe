ALTER TABLE public.orders ENABLE TRIGGER trg_guard_orders_cash;
ALTER TABLE public.orders ENABLE TRIGGER trg_guard_orders_cash_upd;
ALTER TABLE public.orders ENABLE TRIGGER trg_auto_accept_order;
ALTER TABLE public.orders ENABLE TRIGGER trg_notify_new_order_push;
ALTER TABLE public.cash_transactions ENABLE TRIGGER trg_guard_cash_transactions;
ALTER TABLE public.sangrias ENABLE TRIGGER trg_guard_sangrias;
ALTER TABLE public.caderneta_payments ENABLE TRIGGER trg_guard_caderneta_payments;