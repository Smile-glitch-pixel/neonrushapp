GRANT SELECT ON public.leaderboard_scores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_scores TO authenticated;
GRANT ALL ON public.leaderboard_scores TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_state TO authenticated;
GRANT ALL ON public.player_state TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;