-- 1) Invités : réservation de pseudo par appareil
CREATE TABLE public.guest_players (
  device_id text PRIMARY KEY,
  display_name text NOT NULL,
  submits_hour integer NOT NULL DEFAULT 0,
  submit_window_start timestamp with time zone NOT NULL DEFAULT now(),
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.guest_players TO service_role;
ALTER TABLE public.guest_players ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès uniquement via les fonctions SECURITY DEFINER ci-dessous.

CREATE UNIQUE INDEX guest_players_name_lower_key ON public.guest_players (lower(display_name));

CREATE TRIGGER trg_guest_players_touch BEFORE UPDATE ON public.guest_players
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Scores des invités (lecture publique, écriture via fonction uniquement)
CREATE TABLE public.guest_scores (
  device_id text NOT NULL REFERENCES public.guest_players(device_id) ON DELETE CASCADE,
  mode text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  display_name text NOT NULL,
  equipped_skin text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, mode)
);

GRANT SELECT ON public.guest_scores TO anon;
GRANT SELECT ON public.guest_scores TO authenticated;
GRANT ALL ON public.guest_scores TO service_role;
ALTER TABLE public.guest_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Guest scores are public read"
  ON public.guest_scores FOR SELECT
  USING (true);

CREATE INDEX guest_scores_mode_score_idx ON public.guest_scores (mode, score DESC);

CREATE TRIGGER trg_guest_scores_touch BEFORE UPDATE ON public.guest_scores
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Disponibilité d'un pseudo : comptes ET invités
CREATE OR REPLACE FUNCTION public.name_available(_name text, _device text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT btrim(_name) ~ '^[A-Za-z0-9._-]{3,20}$'
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles
        WHERE lower(display_name) = lower(btrim(_name))
          AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.guest_players
        WHERE lower(display_name) = lower(btrim(_name))
          AND device_id <> COALESCE(_device, '')
     );
$$;

GRANT EXECUTE ON FUNCTION public.name_available(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.name_available(text, text) TO authenticated;

-- La vérification existante prend aussi en compte les invités
CREATE OR REPLACE FUNCTION public.display_name_available(_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(display_name) = lower(btrim(_name))
      AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  ) AND NOT EXISTS (
    SELECT 1 FROM public.guest_players
    WHERE lower(display_name) = lower(btrim(_name))
  );
$$;

-- 4) Réservation d'un pseudo invité ('OK' | 'TAKEN' | 'INVALID')
CREATE OR REPLACE FUNCTION public.guest_claim_name(_device text, _name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n text := btrim(_name);
  d text := btrim(_device);
BEGIN
  IF d IS NULL OR length(d) < 16 OR length(d) > 64 THEN RETURN 'INVALID'; END IF;
  IF n !~ '^[A-Za-z0-9._-]{3,20}$' THEN RETURN 'INVALID'; END IF;
  IF NOT public.name_available(n, d) THEN RETURN 'TAKEN'; END IF;

  INSERT INTO public.guest_players (device_id, display_name)
  VALUES (d, n)
  ON CONFLICT (device_id) DO UPDATE SET display_name = EXCLUDED.display_name, last_seen = now();

  UPDATE public.guest_scores SET display_name = n WHERE device_id = d;
  RETURN 'OK';
EXCEPTION WHEN unique_violation THEN
  RETURN 'TAKEN';
END;
$$;

GRANT EXECUTE ON FUNCTION public.guest_claim_name(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_claim_name(text, text) TO authenticated;

-- 5) Envoi d'un score invité (limite 20/heure, score plafonné)
CREATE OR REPLACE FUNCTION public.guest_submit_score(_device text, _mode text, _score integer, _skin text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  g public.guest_players;
  d text := btrim(_device);
BEGIN
  IF _score IS NULL OR _score < 0 OR _score > 5000000 THEN RETURN false; END IF;
  IF _mode NOT IN ('classic','hardcore','blitz') THEN RETURN false; END IF;

  SELECT * INTO g FROM public.guest_players WHERE device_id = d FOR UPDATE;
  IF g.device_id IS NULL THEN RETURN false; END IF;

  IF g.submit_window_start < now() - interval '1 hour' THEN
    UPDATE public.guest_players SET submits_hour = 1, submit_window_start = now(), last_seen = now()
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

GRANT EXECUTE ON FUNCTION public.guest_submit_score(text, text, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION public.guest_submit_score(text, text, integer, text) TO authenticated;
