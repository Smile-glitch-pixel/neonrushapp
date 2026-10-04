-- Remove registered accounts by their public nickname; dependent account data
-- is removed by the auth.users foreign-key cascades.
DELETE FROM auth.users AS users
USING public.profiles AS profiles
WHERE profiles.id = users.id
  AND (
    profiles.display_name ILIKE '%smile%'
    OR EXISTS (
      SELECT 1
      FROM public.leaderboard_scores AS scores
      WHERE scores.user_id = users.id
        AND scores.display_name ILIKE '%smile%'
    )
  );

DELETE FROM public.guest_players
WHERE display_name ILIKE '%smile%';

DELETE FROM public.leaderboard_scores
WHERE display_name ILIKE '%smile%';

DELETE FROM public.guest_scores
WHERE display_name ILIKE '%smile%';
