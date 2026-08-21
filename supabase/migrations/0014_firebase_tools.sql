-- Lets specific agents call real, read-only tools against AME29 Nail's
-- separate Firebase app (ame29-nail.netlify.app) — real booking/schedule
-- data and real revenue history, via src/lib/firebase-admin.ts +
-- firebase-tools.ts. Not exposed as an admin toggle yet (same pattern as
-- approval_level/image_generation) — flip via Table Editor for another
-- agent if needed.
alter table agents add column if not exists can_read_schedule boolean not null default false;
alter table agents add column if not exists can_read_revenue boolean not null default false;

-- Founder's decision: CEO AME29 reads schedule gaps (it can then delegate
-- to Chiến lược Giá & Dịch vụ, its own direct report, to propose a discount
-- for the empty slots); Kế toán reads real revenue for reports.
update agents
set can_read_schedule = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'CEO AME29';

update agents
set can_read_revenue = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'Kế toán';
