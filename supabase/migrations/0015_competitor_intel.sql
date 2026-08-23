-- Lets specific agents read the founder's real competitor/pricing research
-- (233 Osaka/national nail salons, compiled by hand from Google Maps,
-- Hotpepper, Instagram, TikTok, Minimo) via src/lib/competitor-tools.ts.
-- Unlike the Firebase tools (migration 0014) this is a bundled static
-- snapshot, not a live feed — see that file's header comment.
alter table agents add column if not exists can_read_competitors boolean not null default false;

-- Founder's decision: the pricing/service strategy specialist is the one
-- that reasons about competitors and pricing day to day.
update agents
set can_read_competitors = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'Chiến lược Giá & Dịch vụ';
