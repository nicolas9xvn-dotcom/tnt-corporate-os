-- Lets a specific agent (Đồ họa & Thương hiệu MỀU) generate a real image
-- from a source photo, using Gemini's own native image output — reuses the
-- existing GEMINI_API_KEY (free tier), no new paid API needed. See
-- src/lib/actions/agent-runner.ts for how this is used.
--
-- Not exposed as an admin toggle in the UI yet (matches how approval_level
-- works today) — flip it for another agent later via Supabase Table Editor
-- if needed.
alter table agents add column if not exists image_generation boolean not null default false;

-- Where the generated image ends up in the "task-attachments" Storage
-- bucket (reused — same RLS as source attachments already covers it since
-- both are written by the same acting user's session).
alter table tasks add column if not exists output_image_path text;

update agents
set image_generation = true
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'Đồ họa & Thương hiệu MỀU';
