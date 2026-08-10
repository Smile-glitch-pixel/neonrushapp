CREATE OR REPLACE FUNCTION public.duo_create_room(_name text, _skin text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  new_code text;
  new_id uuid;
  tries integer := 0;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.duo_cleanup();

  DELETE FROM public.rooms
   WHERE host_id = uid AND status IN ('waiting','ready');

  LOOP
    tries := tries + 1;
    new_code := '';
    FOR i IN 1..6 LOOP
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
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
$function$;