REVOKE ALL ON FUNCTION public.duo_is_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duo_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.duo_create_room(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duo_join_room(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duo_guard_score() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.duo_is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_create_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_join_room(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duo_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.duo_guard_score() TO service_role;