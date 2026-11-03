ALTER TABLE public.checklists ADD COLUMN labels jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.checklists.labels IS 'Optional per-member display names: {"3":"Asha"}. Member numbers remain authoritative.';
CREATE TABLE public.frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  member_count smallint NOT NULL CHECK (member_count BETWEEN 1 AND 100),
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frameworks TO authenticated;
GRANT ALL ON public.frameworks TO service_role;
ALTER TABLE public.frameworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own framework select" ON public.frameworks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own framework insert" ON public.frameworks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own framework update" ON public.frameworks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own framework delete" ON public.frameworks FOR DELETE TO authenticated USING (auth.uid() = user_id);