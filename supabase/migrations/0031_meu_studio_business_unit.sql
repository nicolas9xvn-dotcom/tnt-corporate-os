-- Founder's decision (2026-09-24): MỀU (character IP) gets its own business
-- unit, separate from the AME29 salon, so MỀU's content calendar, social
-- accounts (own TikTok/Instagram) and later its own Drive folder never mix
-- with AME29's — AME29 ≠ MỀU. Data only: no departments/agents yet (the
-- studio runs manually on ChatGPT + Dola + CapCut in phase 1), so the
-- daily-report cron skips it ("Chưa có agent executive") and process-inbox
-- skips it until google_drive_root_folder_id is filled in.
-- Safe to re-run: upserts on (organization_id, name).

do $seed$
declare
  v_org_id uuid;
begin
  select id into v_org_id from organizations limit 1;
  if v_org_id is null then
    raise exception 'Chưa có dòng nào trong organizations — insert TNT Corporation trước (xem README).';
  end if;

  insert into business_units (organization_id, name, status, ceo_title)
  values (v_org_id, 'MỀU Studio', 'active', 'Creative Director MỀU')
  on conflict (organization_id, name) do update set status = excluded.status, ceo_title = excluded.ceo_title;
end
$seed$;
