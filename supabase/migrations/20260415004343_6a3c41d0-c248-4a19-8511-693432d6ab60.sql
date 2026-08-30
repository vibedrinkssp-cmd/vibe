
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  role text DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  UNIQUE(endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can manage push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
