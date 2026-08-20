-- Supports the direct-to-Storage attachment upload flow in run-task.ts:
-- the browser now uploads files straight to Supabase Storage (bypassing
-- Vercel's ~4.5MB request-body limit on Server Actions entirely), which
-- means a task row has to exist *before* the upload so Storage RLS
-- (migration 0008) can check it. If the browser-side upload fails partway
-- through, cancelTaskDraft() needs to delete that now-useless draft row.

-- Narrowly scoped: only lets someone delete their own still-"pending"
-- (i.e. never actually submitted) task — real tasks are never in that
-- status once runAgentTask() finishes, so this can't be used to delete
-- anything that matters.
drop policy if exists "tasks_delete_own_pending_draft" on tasks;
create policy "tasks_delete_own_pending_draft" on tasks
  for delete to authenticated using (
    status = 'pending' and created_by = auth.uid()
  );

-- Explicit per-bucket cap instead of relying on the project-wide default,
-- so behavior doesn't depend on which default Supabase happens to apply.
-- Matches the 20MB-per-file client-side limit in run-task-form.tsx.
update storage.buckets set file_size_limit = 20971520 where id = 'task-attachments';
