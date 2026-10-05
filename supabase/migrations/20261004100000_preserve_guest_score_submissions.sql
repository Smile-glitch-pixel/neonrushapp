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

  IF EXISTS (
    SELECT 1
    FROM public.guest_scores
    WHERE device_id = d
      AND mode = _mode
      AND score >= _score
  ) THEN
    RETURN true;
  END IF;

  IF g.submit_window_start < now() - interval '1 hour' THEN
    UPDATE public.guest_players
       SET submits_hour = 1, submit_window_start = now(), last_seen = now()
     WHERE device_id = d;
  ELSIF g.submits_hour >= 20 THEN
    RETURN false;
  ELSE
    UPDATE public.guest_players
       SET submits_hour = submits_hour + 1, last_seen = now()
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
