-- Overall leaderboard based on current campaign point balances.
-- This deliberately returns only display fields and aggregated balances; it does
-- not expose campaign_users rows or the user's per-campaign balances.
CREATE OR REPLACE FUNCTION public.get_overall_leaderboard()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH user_totals AS (
    SELECT
      cu.user_id,
      SUM(COALESCE(cu.points_balance, 0))::bigint AS points
    FROM public.campaign_users AS cu
    GROUP BY cu.user_id
    HAVING SUM(COALESCE(cu.points_balance, 0)) > 0
  ),
  user_names AS (
    SELECT
      totals.user_id,
      COALESCE(
        NULLIF(BTRIM(p.display_name), ''),
        NULLIF(BTRIM(lb.display_name), ''),
        'Movie Explorer'
      )::text AS display_name,
      COALESCE(
        NULLIF(BTRIM(p.avatar_url), ''),
        NULLIF(BTRIM(lb.avatar_url), ''),
        ''
      )::text AS avatar_url
    FROM user_totals AS totals
    LEFT JOIN public.profiles AS p
      ON p.user_id = totals.user_id
    LEFT JOIN LATERAL (
      SELECT cbl.display_name, cbl.avatar_url
      FROM public.campaign_leaderboard AS cbl
      WHERE cbl.user_id = totals.user_id
      ORDER BY cbl.points DESC, cbl.rank ASC
      LIMIT 1
    ) AS lb ON TRUE
  ),
  ranked AS (
    SELECT
      totals.user_id,
      names.display_name,
      names.avatar_url,
      totals.points,
      ROW_NUMBER() OVER (
        ORDER BY totals.points DESC, totals.user_id ASC
      )::bigint AS rank
    FROM user_totals AS totals
    JOIN user_names AS names
      ON names.user_id = totals.user_id
  )
  SELECT
    ranked.user_id AS id,
    ranked.user_id,
    ranked.display_name,
    ranked.avatar_url,
    ranked.points,
    ranked.rank
  FROM ranked
  WHERE ranked.rank <= 50
     OR ranked.user_id = (SELECT auth.uid())
  ORDER BY ranked.rank ASC;
$function$;

-- A signed-in user may view the public scoreboard, but anonymous clients may not.
REVOKE EXECUTE ON FUNCTION public.get_overall_leaderboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overall_leaderboard() TO authenticated;
