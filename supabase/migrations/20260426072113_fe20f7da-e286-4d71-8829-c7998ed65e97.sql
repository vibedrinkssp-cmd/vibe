-- 1. Drop the obsolete overload without idempotency to remove ambiguity
DROP FUNCTION IF EXISTS public.create_delivery_order_with_items(
  p_user_id uuid,
  p_address_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_discount numeric,
  p_total numeric,
  p_payment_method payment_method,
  p_items text,
  p_change_for numeric,
  p_notes text,
  p_delivery_distance numeric
);

-- 2. Add a UNIQUE partial index to enforce idempotency at the DB level.
-- Prevents two pending orders for the same (user, client_request_id) even under race conditions.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_user_client_request_id
  ON public.orders (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3. Cancel the 4 orphaned R$23 PIX orders that got duplicated (only one was actually paid).
UPDATE public.orders
SET status = 'cancelled',
    notes = COALESCE(notes, '') || ' | [auto] cancelado por duplicação PIX'
WHERE id IN (
  'a3a341c6-3eb2-42ba-811f-043ebf63eca5',
  '508e941d-3e1a-4db0-b8bc-6ba89e4e83ea',
  '0e2e52af-42c5-4404-9aa6-c6b8b8c9dfc0',
  'b87bf734-a7ae-4cb5-a797-f404deeb9cfa'
)
AND status = 'pending';