CREATE UNIQUE INDEX IF NOT EXISTS profiles_display_name_lower_key
  ON public.profiles (lower(display_name))
  WHERE display_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.display_name_available(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(display_name) = lower(btrim(_name))
      AND id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  );
$$;

GRANT EXECUTE ON FUNCTION public.display_name_available(text) TO authenticated;