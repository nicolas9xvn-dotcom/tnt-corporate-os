-- Lets a report carry an attached file (e.g. the PDF from an automated
-- "báo cáo tổng quan" run) — same pattern as tasks.output_file_path
-- (migration 0020), same "task-attachments" Storage bucket. A report row
-- with no file is still valid (a plain manually-typed report).
alter table reports add column if not exists output_file_path text;
alter table reports add column if not exists output_file_name text;
