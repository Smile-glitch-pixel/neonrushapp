-- ============================================================
-- FIX B7 MINIMAL: Host leave lobby → promote partner
-- ============================================================
-- Ne touche PAS: duo_leave (TS), duo_tick, duo_guest_tick, playing
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.duo_guest_leave(_room uuid, _device text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms;
  partner_device text;
BEGIN
  IF NOT public.duo_is_guest_member(_room, btrim(_device)) THEN RETURN; END IF;
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL THEN RETURN; END IF;

  -- EN PARTIE : comportement INCHANGÉ (marque dead + appelle tick)
  IF r.status = 'playing' THEN
    UPDATE public.room_players
       SET state = 'dead', down_until = NULL, finished = true, last_seen = now()
     WHERE room_id = _room AND device_id = btrim(_device);
    PERFORM public.duo_guest_tick(_room, btrim(_device));
    RETURN;
  END IF;

  -- LOBBY (waiting/ready) : récupère partner AVANT delete
  SELECT device_id INTO partner_device
    FROM public.room_players
   WHERE room_id = _room AND device_id IS DISTINCT FROM btrim(_device)
   LIMIT 1;

  DELETE FROM public.room_players WHERE room_id = _room AND device_id = btrim(_device);

  -- SI HOST EN LOBBY : promouvoir partner
  IF r.host_device_id = btrim(_device) THEN
    IF partner_device IS NOT NULL THEN
      UPDATE public.rooms
         SET host_device_id = partner_device, status = 'waiting'
       WHERE id = _room;
      UPDATE public.room_players
         SET is_host = true
       WHERE room_id = _room AND device_id = partner_device;
    ELSE
      DELETE FROM public.rooms WHERE id = _room;
    END IF;
  ELSE
    UPDATE public.rooms SET status = 'waiting' WHERE id = _room;
  END IF;
END;
$$;

COMMIT;