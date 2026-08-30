
-- Face descriptor + ref photo on employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS face_descriptor jsonb,
  ADD COLUMN IF NOT EXISTS reference_photo_url text;

-- Punch types
DO $$ BEGIN
  CREATE TYPE public.punch_type AS ENUM ('in', 'out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.employee_time_clocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  punch_type public.punch_type NOT NULL,
  punched_at timestamptz NOT NULL DEFAULT now(),
  photo_url text,
  match_score numeric,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_clocks_emp_at
  ON public.employee_time_clocks(employee_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_clocks_at
  ON public.employee_time_clocks(punched_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_time_clocks TO authenticated;
GRANT ALL ON public.employee_time_clocks TO service_role;
GRANT SELECT, INSERT ON public.employee_time_clocks TO anon;

ALTER TABLE public.employee_time_clocks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "read time clocks public"
    ON public.employee_time_clocks FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "insert time clocks public"
    ON public.employee_time_clocks FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "manage time clocks authenticated"
    ON public.employee_time_clocks FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Storage policies for employee-faces bucket
DO $$ BEGIN
  CREATE POLICY "public read employee-faces"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'employee-faces');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public write employee-faces"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'employee-faces');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "public update employee-faces"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'employee-faces');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
