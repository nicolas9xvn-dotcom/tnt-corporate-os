-- Lets any agent hand back a real downloadable file (Excel/PDF/Word)
-- instead of only chat text, via the new generate_file tool — see
-- src/lib/file-generator.ts and src/lib/actions/agent-runner.ts. Same
-- storage/RLS pattern as output_image_path (migration 0013): written into
-- the existing "task-attachments" bucket by the same acting user's session.
alter table tasks add column if not exists output_file_path text;
alter table tasks add column if not exists output_file_name text;
