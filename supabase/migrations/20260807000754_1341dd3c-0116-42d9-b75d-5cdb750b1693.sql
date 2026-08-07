-- =========================
-- DUO MODE
-- =========================

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','ready','playing','finished')),
  duration_s integer NOT NULL DEFAULT 60,
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  equipped_skin text,
  score integer NOT NULL DEFAULT 0,
  is_host boolean NOT NULL DEFAULT false,
  finished boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE public.duo_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid UNIQUE REFERENCES public.rooms(id) ON DELETE SET NULL,
  host_id uuid NOT NULL,
  guest_id uuid,
  host_score integer NOT NULL DEFAULT 0,
  guest_score integer NOT NULL DEFAULT 0,
  winner_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_players_room ON public.room_players(room_id);
CREATE INDEX idx_rooms_created_at ON public.rooms(created_at);

-- Data API grants
GRANT SELECT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.room_players TO authenticated;
GRANT ALL ON public.room_players TO service_role;
GRANT SELECT, INSERT ON public.duo_matches TO authenticated;
GRANT ALL ON public.duo_matches TO service_role;

-- Membership helper (security definer avoids recursive RLS lookups)
CREATE OR REPLACE FUNCTION public.duo_is_member(_room uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = _room AND user_id = _uid);
$$;

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duo_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their room" ON public.rooms
  FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR public.duo_is_member(id, auth.uid()));

CREATE POLICY "Members update their room" ON public.rooms
  FOR UPDATE TO authenticated
  USING (host_id = auth.uid() OR public.duo_is_member(id, auth.uid()))
  WITH CHECK (host_id = auth.uid() OR public.duo_is_member(id, auth.uid()));

CREATE POLICY "Host deletes their room" ON public.rooms
  FOR DELETE TO authenticated
  USING (host_id = auth.uid());

CREATE POLICY "Members read room players" ON public.room_players
  FOR SELECT TO authenticated
  USING (public.duo_is_member(room_id, auth.uid()));

CREATE POLICY "Players update own row" ON public.room_players
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Players leave room" ON public.room_players
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Participants read their matches" ON public.duo_matches
  FOR SELECT TO authenticated
  USING (host_id = auth.uid() OR guest_id = auth.uid());

CREATE POLICY "Participants record their match" ON public.duo_matches
  FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() OR guest_id = auth.uid());

-- Anti-cheat: score must be monotonic and plausible for the elapsed duel time
CREATE OR REPLACE FUNCTION public.duo_guard_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms;
  elapsed numeric;
  max_score integer;
BEGIN
  NEW.updated_at := now();
  IF NEW.score = OLD.score THEN
    RETURN NEW;
  END IF;
  IF NEW.score < OLD.score THEN
    RAISE EXCEPTION 'Duo score cannot decrease';
  END IF;

  SELECT * INTO r FROM public.rooms WHERE id = NEW.room_id;
  IF r.started_at IS NULL THEN
    RAISE EXCEPTION 'Duel has not started';
  END IF;

  elapsed := LEAST(
    EXTRACT(EPOCH FROM (now() - r.started_at)) + 3,
    r.duration_s + 5
  );
  max_score := CEIL(elapsed * 150) + 600;
  IF NEW.score > max_score THEN
    RAISE EXCEPTION 'Implausible duo score';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_duo_guard_score
  BEFORE UPDATE ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.duo_guard_score();

CREATE TRIGGER trg_rooms_touch
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Remove ghost rooms
CREATE OR REPLACE FUNCTION public.duo_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rooms WHERE created_at < now() - interval '2 hours';
$$;

-- Atomic room creation with unique invite code
CREATE OR REPLACE FUNCTION public.duo_create_room(_name text, _skin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_code text;
  new_id uuid;
  tries integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.duo_cleanup();

  -- drop this user's stale unfinished rooms
  DELETE FROM public.rooms
   WHERE host_id = uid AND status IN ('waiting','ready');

  LOOP
    tries := tries + 1;
    new_code := upper(substring(replace(encode(gen_random_bytes(8), 'base64'), '/', 'A') from 1 for 6));
    new_code := translate(new_code, '+=OIL0', 'XYZWQR');
    BEGIN
      INSERT INTO public.rooms (code, host_id) VALUES (new_code, uid) RETURNING id INTO new_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF tries > 8 THEN RAISE EXCEPTION 'Could not allocate a duo code'; END IF;
    END;
  END LOOP;

  INSERT INTO public.room_players (room_id, user_id, display_name, equipped_skin, is_host)
  VALUES (new_id, uid, _name, _skin, true);

  RETURN new_id;
END;
$$;

-- Atomic join by invite code
CREATE OR REPLACE FUNCTION public.duo_join_room(_code text, _name text, _skin text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  r public.rooms;
  n integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO r FROM public.rooms
   WHERE code = upper(trim(_code))
   FOR UPDATE;

  IF r.id IS NULL THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
  IF r.created_at < now() - interval '2 hours' THEN RAISE EXCEPTION 'ROOM_EXPIRED'; END IF;
  IF r.host_id = uid THEN RAISE EXCEPTION 'ROOM_OWN'; END IF;
  IF r.status NOT IN ('waiting','ready') THEN RAISE EXCEPTION 'ROOM_CLOSED'; END IF;

  SELECT count(*) INTO n FROM public.room_players WHERE room_id = r.id;
  IF n >= 2 AND NOT EXISTS (SELECT 1 FROM public.room_players WHERE room_id = r.id AND user_id = uid) THEN
    RAISE EXCEPTION 'ROOM_FULL';
  END IF;

  INSERT INTO public.room_players (room_id, user_id, display_name, equipped_skin, is_host)
  VALUES (r.id, uid, _name, _skin, false)
  ON CONFLICT (room_id, user_id) DO UPDATE SET display_name = EXCLUDED.display_name, equipped_skin = EXCLUDED.equipped_skin;

  UPDATE public.rooms SET status = 'ready' WHERE id = r.id AND status = 'waiting';

  RETURN r.id;
END;
$$;

-- Realtime
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;