-- Adds image generation as a regular TOOL CALL (generate_image, see
-- agent-runner.ts) instead of the all-or-nothing `image_generation` switch
-- (migration 0013) that makes an agent ONLY ever produce an image for
-- every task. TikTok/Facebook/Instagram Agent need to keep writing plain
-- captions/scripts most of the time and only reach for an image when a
-- task actually calls for one (founder's decision: "chỉ soạn content + ảnh,
-- chưa tự đăng" — no platform posting API involved, still text/image
-- drafts only).
alter table agents add column if not exists can_generate_images boolean not null default false;

update agents
set can_generate_images = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name in ('TikTok Agent', 'Facebook Agent', 'Instagram Agent');
