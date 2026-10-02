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
    'best_by_mode', COALESCE(s.best_by_mode, '{}'::jsonb),
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
