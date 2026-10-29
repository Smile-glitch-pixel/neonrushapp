-- ============================================================
-- FIX B6 MINIMAL : Host leave lobby → promote partner (auth)
-- ============================================================
-- Ne touche PAS : duo_leave (TS), duo_tick, duo_guest_tick, playing
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.duo_leave_promote(_room uuid, _leaving_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms;
  partner_user uuid;
  is_host_leaving boolean;
  in_lobby boolean;
BEGIN
  -- Verrouiller la room + joueurs
  SELECT * INTO r FROM public.rooms WHERE id = _room FOR UPDATE;
  IF r.id IS NULL THEN
    RETURN jsonb_build_object('promoted', false, 'room_deleted', true, 'reason', 'ROOM_NOT_FOUND');
  END IF;

  in_lobby := r.status IN ('waiting', 'ready');
  is_host_leaving := (r.host_id = _leaving_user);

  -- Récupérer partenaire AVANT suppression (sous verrou)
  SELECT user_id INTO partner_user
    FROM public.room_players
   WHERE room_id = _room
     AND user_id IS DISTINCT FROM _leaving_user
   LIMIT 1
   FOR UPDATE;

  -- Supprimer le joueur partant
  DELETE FROM public.room_players WHERE room_id = _room AND user_id = _leaving_user;

  IF in_lobby AND is_host_leaving THEN
    IF partner_user IS NOT NULL THEN
      -- PROMOTION : partenaire devient hôte
      UPDATE public.rooms
         SET host_id = partner_user, status = 'waiting'
       WHERE id = _room;

      UPDATE public.room_players
         SET is_host = true
       WHERE room_id = _room AND user_id = partner_user;

      RETURN jsonb_build_object('promoted', true, 'room_deleted', false, 'new_host', partner_user);
    ELSE
      -- Dernier joueur : supprimer la room
      DELETE FROM public.rooms WHERE id = _room;
      RETURN jsonb_build_object('promoted', false, 'room_deleted', true, 'reason', 'LAST_PLAYER');
    END IF;
  ELSE
    -- Non-hôte ou EN PARTIE : juste status waiting
    IF in_lobby THEN
      UPDATE public.rooms SET status = 'waiting' WHERE id = _room;
    END IF;
    RETURN jsonb_build_object('promoted', false, 'room_deleted', false, 'reason', 'NOT_HOST_OR_PLAYING');
  END IF;
END;
$$;

-- Droits d'exécution
REVOKE ALL ON FUNCTION public.duo_leave_promote(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.duo_leave_promote(uuid, uuid) TO authenticated;

COMMIT;