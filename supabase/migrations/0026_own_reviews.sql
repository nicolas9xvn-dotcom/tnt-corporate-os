-- Lets Google Maps Master read AME29's OWN real Google Maps reviews
-- (src/lib/google-places.ts, function getOwnReviews) — read-only, drafts a
-- suggested reply for the founder to copy, never posts anything back to
-- Google (no Business Profile write access exists in this codebase at
-- all). Reuses the same GOOGLE_PLACES_API_KEY and the AME29 row already
-- sitting in `competitors` (is_ame29 = true, see migration 0016/0017) —
-- founder just needs to fill in that row's google_place_id on the
-- "Dữ liệu đối thủ" page if not already set.
alter table agents add column if not exists can_read_own_reviews boolean not null default false;

update agents
set can_read_own_reviews = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'Google Maps Master';
