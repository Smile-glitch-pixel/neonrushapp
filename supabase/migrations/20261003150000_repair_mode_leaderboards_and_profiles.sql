ALTER TABLE public.leaderboard_scores
  DROP CONSTRAINT IF EXISTS leaderboard_scores_mode_check;

ALTER TABLE public.leaderboard_scores
  ADD CONSTRAINT leaderboard_scores_mode_check
  CHECK (mode IN ('classic', 'hardcore', 'zen', 'blitz', 'surge', 'treasure', 'halloween'));

ALTER TABLE public.guest_scores
  DROP CONSTRAINT IF EXISTS guest_scores_mode_check;

ALTER TABLE public.guest_scores
  ADD CONSTRAINT guest_scores_mode_check
  CHECK (mode IN ('classic', 'hardcore', 'zen', 'blitz', 'surge', 'treasure', 'halloween'));

CREATE OR REPLACE FUNCTION public.guest_submit_score(
  _device text, _mode text, _score integer, _skin text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guest_players;
  d text := btrim(_device);
BEGIN
  IF _score IS NULL OR _score < 0 OR _score > 5000000 THEN RETURN false; END IF;
  IF _mode NOT IN ('classic', 'hardcore', 'zen', 'blitz', 'surge', 'treasure', 'halloween') THEN
    RETURN false;
  END IF;

  SELECT * INTO g FROM public.guest_players WHERE device_id = d FOR UPDATE;
  IF g.device_id IS NULL THEN RETURN false; END IF;

  IF g.submit_window_start < now() - interval '1 hour' THEN
    UPDATE public.guest_players
       SET submits_hour = 1, submit_window_start = now(), last_seen = now()
     WHERE device_id = d;
  ELSIF g.submits_hour >= 20 THEN
    RETURN false;
  ELSE
    UPDATE public.guest_players SET submits_hour = submits_hour + 1, last_seen = now()
     WHERE device_id = d;
  END IF;

  INSERT INTO public.guest_scores (device_id, mode, score, display_name, equipped_skin)
  VALUES (d, _mode, _score, g.display_name, _skin)
  ON CONFLICT (device_id, mode) DO UPDATE
    SET score = GREATEST(public.guest_scores.score, EXCLUDED.score),
        display_name = EXCLUDED.display_name,
        equipped_skin = EXCLUDED.equipped_skin;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.guest_submit_score(text, text, integer, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_player_profile(_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text := btrim(_name);
  result jsonb;
BEGIN
  IF n !~ '^[A-Za-z0-9._-]{3,20}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'display_name', p.display_name,
    'created_at', p.created_at,
    'equipped_skin', s.equipped,
    'best_by_mode', COALESCE(s.best_by_mode, '{}'::jsonb) || COALESCE((
      SELECT jsonb_object_agg(ls.mode, ls.score)
      FROM public.leaderboard_scores ls
      WHERE ls.user_id = p.id
    ), '{}'::jsonb),
    'stats', COALESCE(s.stats, '{}'::jsonb),
    'xp', s.xp,
    'level', s.level,
    'skin_count', CASE
      WHEN jsonb_typeof(s.owned) = 'array' THEN jsonb_array_length(s.owned)
      ELSE 0
    END,
    'guest', false
  )
  INTO result
  FROM public.profiles p
  LEFT JOIN public.player_state s ON s.user_id = p.id
  WHERE lower(p.display_name) = lower(n)
  LIMIT 1;

  IF result IS NOT NULL THEN
    RETURN result;
  END IF;

  SELECT jsonb_build_object(
    'display_name', g.display_name,
    'created_at', g.created_at,
    'equipped_skin', (
      SELECT gs.equipped_skin
      FROM public.guest_scores gs
      WHERE gs.device_id = g.device_id
      ORDER BY gs.updated_at DESC
      LIMIT 1
    ),
    'best_by_mode', COALESCE(scores.best_by_mode, '{}'::jsonb),
    'stats', '{}'::jsonb,
    'xp', NULL,
    'level', NULL,
    'skin_count', NULL,
    'guest', true
  )
  INTO result
  FROM public.guest_players g
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(gs.mode, gs.score) AS best_by_mode
    FROM public.guest_scores gs
    WHERE gs.device_id = g.device_id
  ) scores ON true
  WHERE lower(g.display_name) = lower(n)
  LIMIT 1;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.public_player_profile(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_player_profile(text) TO anon, authenticated;
