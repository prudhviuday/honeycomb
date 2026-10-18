-- Associate existing campaign records with a movie only when the campaign
-- title is an exact match after removing a trailing "Campaign" suffix.
update public.campaigns c
set movie_id = m.id
from public.movies m
where c.movie_id is null
  and c.active = true
  and m.active = true
  and lower(trim(regexp_replace(c.name, '[[:space:]]+campaign$', '', 'i'))) = lower(trim(m.title));

-- Give existing eligible QR records public URL tokens without changing their
-- legacy code_hash, so already-printed in-app codes remain valid.
update public.qr_codes q
set public_code = upper(replace(gen_random_uuid()::text, '-', ''))
from public.campaigns c
join public.movies m on m.id = c.movie_id and m.active = true
where q.campaign_id = c.id
  and c.active = true
  and q.public_code is null;
