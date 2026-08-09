-- ---------- rooms: coop team fields ----------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS team_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS survived_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revives integer NOT NULL DEFAULT 0;

-- ---------- room_players: coop state machine ----------
ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'alive',
  ADD COLUMN IF NOT EXISTS down_until timestamptz,
  ADD COLUMN IF NOT EXISTS revives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now();

-- ---------- duo_matches: no winner/loser anymore ----------
ALTER TABLE public.duo_matches
  ADD COLUMN IF NOT EXISTS team_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revives integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'coop_end';

UPDATE public.duo_matches
   SET team_score = COALESCE(host_score, 0) + COALESCE(guest_score, 0)
 WHERE team_score = 0;

ALTER TABLE public.duo_matches DROP COLUMN IF EXISTS winner_id;
ALTER TABLE public.duo_matches DROP COLUMN IF EXISTS host_score;
ALTER TABLE public.duo_matches DROP COLUMN IF EXISTS guest_score;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='duo_matches' AND column_name='host_id') THEN
    ALTER TABLE public.duo_matches RENAME COLUMN host_id TO player_a_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='duo_matches' AND column_name='guest_id') THEN
    ALTER TABLE public.duo_matches RENAME COLUMN guest_id TO player_b_id;
  END IF;
END $$;

DROP POLICY IF EXISTS "Participants read their matches" ON public.duo_matches;
DROP POLICY IF EXISTS "Participants record their match" ON public.duo_matches;
CREATE POLICY "Teammates read their coop matches"
  ON public.duo_matches FOR SELECT TO authenticated
  USING (player_a_id = auth.uid() OR player_b_id = auth.uid());
CREATE POLICY "Teammates record their coop match"
  ON public.duo_matches FOR INSERT TO authenticated
  WITH CHECK (player_a_id = auth.uid() OR player_b_id = auth.uid());

-- ---------- coop: go down (revivable) ----------
CREATE OR REPLACE FUNCTION public.duo_go_down(_room uuid, _down_ms integer DEFAULT 10000)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.duo_is_member(_room, uid) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;

  UPDATE public.room_players
     SET state = 'down',
         down_until = now() + make_interval(secs => GREATEST(1, LEAST(30, _down_ms)) / 1000.0),
         last_seen = now()
   WHERE room_id = _room AND user_id = uid AND state = 'alive';
END;
$$;

-- ---------- coop: revive your teammate ----------
CREATE OR REPLACE FUNCTION public.duo_revive(_room uuid, _target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ok boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.duo_is_member(_room, uid) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  IF uid = _target THEN RAISE EXCEPTION 'SELF_REVIVE'; END IF;

  -- the reviver must be alive
  IF NOT EXISTS (SELECT 1 FROM public.room_players
                  WHERE room_id = _room AND user_id = uid AND state = 'alive') THEN
    RETURN false;
  END IF;

  UPDATE public.room_players
     SET state = 'alive', down_until = NULL, last_seen = now()
   WHERE room_id = _room AND user_id = _target
     AND state = 'down' AND down_until > now();

  IF FOUND THEN
    ok := true;
    UPDATE public.room_players
       SET revives = revives + 1, last_seen = now()
     WHERE room_id = _room AND user_id = uid;
    UPDATE public.rooms SET revives = revives + 1 WHERE id = _room;
  END IF;

  RETURN ok;
END;
$$;

-- ---------- coop: heartbeat ----------
CREATE OR REPLACE FUNCTION public.duo_heartbeat(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.room_players SET last_seen = now()
   WHERE room_id = _room AND user_id = uid;
END;
$$;

-- ---------- coop: expire down players, close run when team is out ----------
CREATE OR REPLACE FUNCTION public.duo_tick(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.duo_is_member(_room, uid) THEN RETURN; END IF;

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

-- ---------- coop: close the run, record the team result ----------
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
  pa uuid;
  pb uuid;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL OR r.status = 'finished' THEN RETURN; END IF;

  SELECT COALESCE(SUM(score), 0), COALESCE(SUM(revives), 0)
    INTO team, rev
    FROM public.room_players WHERE room_id = _room;

  dur := CASE WHEN r.started_at IS NULL THEN 0
              ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - r.started_at)) * 1000))::integer END;

  SELECT user_id INTO pa FROM public.room_players WHERE room_id = _room AND is_host ORDER BY joined_at LIMIT 1;
  SELECT user_id INTO pb FROM public.room_players WHERE room_id = _room AND NOT is_host ORDER BY joined_at LIMIT 1;

  UPDATE public.rooms
     SET status = 'finished', team_score = team, survived_ms = dur, revives = rev
   WHERE id = _room;

  INSERT INTO public.duo_matches (room_id, player_a_id, player_b_id, team_score, duration_ms, revives, outcome)
  VALUES (_room, COALESCE(pa, r.host_id), pb, team, dur, rev, 'coop_end');
END;
$$;

-- ---------- coop: teammate finished their own life ----------
CREATE OR REPLACE FUNCTION public.duo_end_run(_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.duo_is_member(_room, uid) THEN RETURN; END IF;
  UPDATE public.room_players
     SET state = 'dead', down_until = NULL, finished = true, last_seen = now()
   WHERE room_id = _room AND user_id = uid;
  PERFORM public.duo_tick(_room);
END;
$$;

REVOKE ALL ON FUNCTION public.duo_close_coop(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.duo_go_down(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_revive(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_heartbeat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_tick(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_end_run(uuid) TO authenticated;