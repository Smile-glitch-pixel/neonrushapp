ALTER TABLE public.player_state
  ADD COLUMN IF NOT EXISTS gems integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS achievements jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS purchases jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pass_claimed jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.player_state
  ADD CONSTRAINT player_state_gems_non_negative CHECK (gems >= 0),
  ADD CONSTRAINT player_state_coins_non_negative CHECK (coins >= 0);

CREATE TABLE IF NOT EXISTS public.economy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref)
);

GRANT SELECT ON public.economy_events TO authenticated;
GRANT ALL ON public.economy_events TO service_role;
ALTER TABLE public.economy_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own economy events" ON public.economy_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Players append own economy events" ON public.economy_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
GRANT INSERT ON public.economy_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.store_offers (
  id text PRIMARY KEY,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'limited',
  currency text NOT NULL DEFAULT 'coins',
  price integer NOT NULL DEFAULT 0,
  contents jsonb NOT NULL DEFAULT '{}'::jsonb,
  once_per_player boolean NOT NULL DEFAULT false,
  starts_at timestamp with time zone NOT NULL DEFAULT now(),
  ends_at timestamp with time zone,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_offers TO authenticated;
GRANT SELECT ON public.store_offers TO anon;
GRANT ALL ON public.store_offers TO service_role;
ALTER TABLE public.store_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store offers are public read" ON public.store_offers
  FOR SELECT USING (true);

CREATE TRIGGER trg_store_offers_touch BEFORE UPDATE ON public.store_offers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.store_offers (id, title, kind, currency, price, contents, once_per_player, ends_at)
VALUES
  ('starter_pack', 'Starter Pack', 'starter', 'gems', 0,
   '{"coins": 2500, "gems": 150, "chests": 2, "skins": ["gold"]}'::jsonb, true, NULL),
  ('neon_weekly', 'Pack Néon', 'limited', 'coins', 1800,
   '{"coins": 0, "gems": 40, "chests": 1}'::jsonb, false, now() + interval '7 days')
ON CONFLICT (id) DO NOTHING;