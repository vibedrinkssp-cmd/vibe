
CREATE TABLE public.weekly_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL DEFAULT '00:00',
  end_time time NOT NULL DEFAULT '23:59',
  target_type text NOT NULL CHECK (target_type IN ('product','category','drink_type')),
  target_id uuid,
  target_key text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric NOT NULL CHECK (discount_value >= 0),
  min_quantity int NOT NULL DEFAULT 1 CHECK (min_quantity >= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.weekly_promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_promotions TO authenticated;
GRANT ALL ON public.weekly_promotions TO service_role;

ALTER TABLE public.weekly_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read weekly promotions"
  ON public.weekly_promotions FOR SELECT
  USING (true);

CREATE POLICY "Admins manage weekly promotions"
  ON public.weekly_promotions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_weekly_promotions_weekday_active
  ON public.weekly_promotions(weekday, active);

CREATE TRIGGER update_weekly_promotions_updated_at
  BEFORE UPDATE ON public.weekly_promotions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.weekly_promotions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.weekly_promotions;
