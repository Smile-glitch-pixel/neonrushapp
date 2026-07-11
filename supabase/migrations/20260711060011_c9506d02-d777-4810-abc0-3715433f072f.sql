
CREATE TABLE public.leaderboard_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('classic','hardcore','zen','blitz')),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  display_name text,
  equipped_skin text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode)
);

GRANT SELECT ON public.leaderboard_scores TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.leaderboard_scores TO authenticated;
GRANT ALL ON public.leaderboard_scores TO service_role;

ALTER TABLE public.leaderboard_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaderboard is public read"
  ON public.leaderboard_scores FOR SELECT
  USING (true);

CREATE POLICY "Users insert own score"
  ON public.leaderboard_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own score"
  ON public.leaderboard_scores FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own score"
  ON public.leaderboard_scores FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER touch_leaderboard_scores
  BEFORE UPDATE ON public.leaderboard_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX leaderboard_scores_mode_score_idx
  ON public.leaderboard_scores (mode, score DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_scores;
ALTER TABLE public.leaderboard_scores REPLICA IDENTITY FULL;
