-- Add a backward-compatible gallery of movie poster URLs.
-- poster_url remains the primary poster for older consumers; poster_urls stores all supplied poster URLs.
ALTER TABLE public.movies
  ADD COLUMN IF NOT EXISTS poster_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.movies
SET poster_urls = ARRAY[poster_url]
WHERE NULLIF(BTRIM(poster_url), '') IS NOT NULL
  AND COALESCE(CARDINALITY(poster_urls), 0) = 0;

COMMENT ON COLUMN public.movies.poster_urls IS
  'Ordered poster image URLs for the movie. poster_url remains the legacy primary poster URL.';
