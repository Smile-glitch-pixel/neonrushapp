ALTER TABLE public.rooms
  ALTER COLUMN host_id DROP NOT NULL,
  ADD COLUMN host_device_id text REFERENCES public.guest_players(device_id) ON DELETE CASCADE,
  ADD CONSTRAINT rooms_exactly_one_host_identity
    CHECK ((host_id IS NOT NULL) <> (host_device_id IS NOT NULL));

ALTER TABLE public.room_players
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN device_id text REFERENCES public.guest_players(device_id) ON DELETE CASCADE,
  ADD CONSTRAINT room_players_exactly_one_identity
    CHECK ((user_id IS NOT NULL) <> (device_id IS NOT NULL));

CREATE UNIQUE INDEX room_players_room_device_key
  ON public.room_players(room_id, device_id)
  WHERE device_id IS NOT NULL;

ALTER TABLE public.duo_matches
  ALTER COLUMN player_a_id DROP NOT NULL,
  ADD COLUMN player_a_name text,
  ADD COLUMN player_b_name text,
  ADD CONSTRAINT duo_matches_player_a_identity
    CHECK (player_a_id IS NOT NULL OR player_a_name IS NOT NULL);

UPDATE public.duo_matches AS m
SET player_a_name = COALESCE(pa.display_name, 'Player'),
    player_b_name = CASE WHEN m.player_b_id IS NULL THEN NULL ELSE COALESCE(pb.display_name, 'Player') END
FROM public.profiles AS pa
LEFT JOIN public.profiles AS pb ON pb.id = m.player_b_id
WHERE pa.id = m.player_a_id;

CREATE OR REPLACE FUNCTION public.duo_is_guest_member(_room uuid, _device text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = _room AND device_id = _device
  );
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_create_room(_device text, _skin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guest_players;
  new_code text;
  new_id uuid;
  tries integer := 0;
BEGIN
  SELECT * INTO g FROM public.guest_players WHERE device_id = btrim(_device) FOR UPDATE;
  IF g.device_id IS NULL THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;

  PERFORM public.duo_cleanup();
  DELETE FROM public.rooms
   WHERE host_device_id = g.device_id AND status IN ('waiting', 'ready');

  LOOP
    tries := tries + 1;
    new_code := upper(substring(replace(encode(gen_random_bytes(8), 'base64'), '/', 'A') from 1 for 6));
    new_code := translate(new_code, '+=OIL0', 'XYZWQR');
    BEGIN
      INSERT INTO public.rooms (code, host_device_id)
      VALUES (new_code, g.device_id)
      RETURNING id INTO new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF tries > 8 THEN RAISE EXCEPTION 'Could not allocate a duo code'; END IF;
    END;
  END LOOP;

  INSERT INTO public.room_players (room_id, device_id, display_name, equipped_skin, is_host)
  VALUES (new_id, g.device_id, g.display_name, _skin, true);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_join_room(_code text, _device text, _skin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.guest_players;
  r public.rooms;
  n integer;
BEGIN
  SELECT * INTO g FROM public.guest_players WHERE device_id = btrim(_device) FOR UPDATE;
  IF g.device_id IS NULL THEN RAISE EXCEPTION 'GUEST_NAME_REQUIRED'; END IF;

  SELECT * INTO r FROM public.rooms
   WHERE code = upper(trim(_code))
   FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF r.created_at < now() - interval '2 hours' THEN RAISE EXCEPTION 'ROOM_EXPIRED'; END IF;
  IF r.host_device_id = g.device_id THEN RAISE EXCEPTION 'ROOM_OWN'; END IF;
  IF r.status NOT IN ('waiting', 'ready') THEN RAISE EXCEPTION 'ROOM_CLOSED'; END IF;

  SELECT count(*) INTO n FROM public.room_players WHERE room_id = r.id;
  IF n >= 2 AND NOT EXISTS (
    SELECT 1 FROM public.room_players WHERE room_id = r.id AND device_id = g.device_id
  ) THEN
    RAISE EXCEPTION 'ROOM_FULL';
  END IF;

  INSERT INTO public.room_players (room_id, device_id, display_name, equipped_skin, is_host)
  VALUES (r.id, g.device_id, g.display_name, _skin, false)
  ON CONFLICT (room_id, device_id) WHERE device_id IS NOT NULL
  DO UPDATE SET display_name = EXCLUDED.display_name, equipped_skin = EXCLUDED.equipped_skin;

  UPDATE public.rooms SET status = 'ready' WHERE id = r.id AND status = 'waiting';
  RETURN r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_room_state(_room uuid, _device text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms;
  players jsonb;
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;

  UPDATE public.room_players
     SET last_seen = now()
   WHERE room_id = _room AND device_id = btrim(_device);
  PERFORM public.duo_guest_tick(_room, btrim(_device));

  SELECT * INTO r FROM public.rooms WHERE id = _room;
  IF r.id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'user_id', user_id,
      'device_id', CASE WHEN device_id = btrim(_device) THEN device_id ELSE NULL END,
      'display_name', display_name,
      'equipped_skin', equipped_skin,
      'score', score,
      'is_host', is_host,
      'finished', finished,
      'state', CASE
        WHEN last_seen < now() - interval '15 seconds' AND state IN ('alive', 'down')
        THEN 'disconnected'
        ELSE state
      END,
      'down_until', down_until,
      'revives', revives,
      'last_seen', last_seen
    ) ORDER BY is_host DESC
  ), '[]'::jsonb)
  INTO players
  FROM public.room_players
  WHERE room_id = _room;

  RETURN jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'host_id', r.host_id,
    'host_device_id', r.host_device_id,
    'status', r.status,
    'duration_s', r.duration_s,
    'started_at', r.started_at,
    'ends_at', r.ends_at,
    'team_score', r.team_score,
    'survived_ms', r.survived_ms,
    'revives', r.revives,
    'players', players
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_start(_room uuid, _device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.rooms;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL OR NOT public.duo_is_guest_member(_room, btrim(_device)) THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF r.host_device_id <> btrim(_device) THEN RAISE EXCEPTION 'NOT_HOST'; END IF;
  IF (SELECT count(*) FROM public.room_players WHERE room_id = _room) < 2 THEN
    RAISE EXCEPTION 'NOT_ENOUGH_PLAYERS';
  END IF;
  IF r.status = 'playing' THEN RETURN; END IF;
  IF r.status NOT IN ('waiting', 'ready') THEN RAISE EXCEPTION 'ROOM_CLOSED'; END IF;

  UPDATE public.rooms
     SET status = 'playing',
         started_at = now(),
         ends_at = now() + make_interval(secs => duration_s),
         team_score = 0,
         survived_ms = 0,
         revives = 0
   WHERE id = _room;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_begin_run(_room uuid, _device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  UPDATE public.room_players
     SET score = 0, finished = false, state = 'alive', down_until = NULL, revives = 0, last_seen = now()
   WHERE room_id = _room AND device_id = btrim(_device);
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_push_score(_room uuid, _device text, _score integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _score IS NULL OR _score < 0 OR _score > 10000000 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  UPDATE public.room_players
     SET score = GREATEST(score, _score), last_seen = now()
   WHERE room_id = _room AND device_id = btrim(_device);
  PERFORM public.duo_guest_tick(_room, btrim(_device));
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_go_down(_room uuid, _device text, _down_ms integer DEFAULT 10000)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  UPDATE public.room_players
     SET state = 'down',
         down_until = now() + make_interval(secs => GREATEST(1, LEAST(30, _down_ms)) / 1000.0),
         last_seen = now()
   WHERE room_id = _room AND device_id = btrim(_device) AND state = 'alive';
  PERFORM public.duo_guest_tick(_room, btrim(_device));
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_revive(_room uuid, _device text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  revived boolean := false;
  affected integer := 0;
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = _room AND device_id = btrim(_device) AND state = 'alive'
  ) THEN RETURN false; END IF;

  UPDATE public.room_players
     SET state = 'alive', down_until = NULL, last_seen = now()
   WHERE room_id = _room
     AND state = 'down'
     AND down_until > now()
     AND device_id IS DISTINCT FROM btrim(_device);

  GET DIAGNOSTICS affected = ROW_COUNT;
  revived := affected > 0;
  IF revived THEN
    UPDATE public.room_players
       SET revives = revives + 1, last_seen = now()
     WHERE room_id = _room AND device_id = btrim(_device);
    UPDATE public.rooms SET revives = revives + 1 WHERE id = _room;
  END IF;
  RETURN revived;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_revive_any(_room uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  affected integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.duo_is_member(_room, uid) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = _room AND user_id = uid AND state = 'alive'
  ) THEN RETURN false; END IF;

  UPDATE public.room_players
     SET state = 'alive', down_until = NULL, last_seen = now()
   WHERE room_id = _room
     AND state = 'down'
     AND down_until > now()
     AND user_id IS DISTINCT FROM uid;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected > 0 THEN
    UPDATE public.room_players
       SET revives = revives + 1, last_seen = now()
     WHERE room_id = _room AND user_id = uid;
    UPDATE public.rooms SET revives = revives + 1 WHERE id = _room;
  END IF;
  RETURN affected > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_end_run(_room uuid, _device text, _score integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _score IS NULL OR _score < 0 OR _score > 10000000 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  UPDATE public.room_players
     SET score = GREATEST(score, _score), state = 'dead', down_until = NULL, finished = true, last_seen = now()
   WHERE room_id = _room AND device_id = btrim(_device);
  PERFORM public.duo_guest_tick(_room, btrim(_device));
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_tick(_room uuid, _device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RETURN; END IF;
  UPDATE public.room_players
     SET state = 'dead'
   WHERE room_id = _room AND state = 'down' AND down_until IS NOT NULL AND down_until <= now();

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players
    WHERE room_id = _room AND state IN ('alive', 'down')
  ) THEN
    PERFORM public.duo_close_coop(_room);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_guest_leave(_room uuid, _device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.rooms;
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RETURN; END IF;
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL THEN RETURN; END IF;

  IF r.status = 'playing' THEN
    UPDATE public.room_players
       SET state = 'dead', down_until = NULL, finished = true, last_seen = now()
     WHERE room_id = _room AND device_id = btrim(_device);
    PERFORM public.duo_guest_tick(_room, btrim(_device));
    RETURN;
  END IF;

  DELETE FROM public.room_players WHERE room_id = _room AND device_id = btrim(_device);
  IF r.host_device_id = btrim(_device) THEN
    DELETE FROM public.rooms WHERE id = _room;
  ELSE
    UPDATE public.rooms SET status = 'waiting' WHERE id = _room;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.duo_close_coop(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms;
  team integer;
  rev integer;
  dur integer;
  pa public.room_players;
  pb public.room_players;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL OR r.status = 'finished' THEN RETURN; END IF;

  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(revives), 0)
    INTO team, rev
    FROM public.room_players WHERE room_id = _room;

  dur := CASE WHEN r.started_at IS NULL THEN 0
              ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - r.started_at)) * 1000))::integer END;

  SELECT * INTO pa FROM public.room_players WHERE room_id = _room AND is_host ORDER BY joined_at LIMIT 1;
  SELECT * INTO pb FROM public.room_players WHERE room_id = _room AND NOT is_host ORDER BY joined_at LIMIT 1;

  UPDATE public.rooms
     SET status = 'finished', team_score = team, survived_ms = dur, revives = rev
   WHERE id = _room;

  INSERT INTO public.duo_matches (
    room_id, player_a_id, player_b_id, player_a_name, player_b_name,
    team_score, duration_ms, revives, outcome
  )
  VALUES (
    _room, pa.user_id, pb.user_id,
    COALESCE(pa.display_name, 'Player'), pb.display_name, team, dur, rev, 'coop_end'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.duo_is_guest_member(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_create_room(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_join_room(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_room_state(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_start(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_begin_run(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_push_score(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_go_down(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_revive(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_revive_any(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_end_run(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_tick(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duo_guest_leave(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.duo_guest_create_room(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_join_room(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_room_state(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_start(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_begin_run(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_push_score(uuid, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_go_down(uuid, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_revive(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_revive_any(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_end_run(uuid, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.duo_guest_leave(uuid, text) TO anon, authenticated;

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
  IF _mode NOT IN ('classic', 'hardcore', 'zen', 'blitz') THEN RETURN false; END IF;

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
