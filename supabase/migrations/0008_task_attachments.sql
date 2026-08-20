-- File attachments for tasks that need approval before running: the file
-- has to survive from "Giao việc" until someone approves it later, so it's
-- uploaded to a private Storage bucket instead of being sent straight to
-- Gemini (which is what happens for agents that auto-run).

alter table tasks add column if not exists attachments jsonb;

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- Object path convention: "{task_id}/{filename}" — (storage.foldername(name))[1]
-- is the task id, which we join back to tasks/agents to reuse the same
-- business-unit scoping already used by the tasks_select/tasks_insert policies.
drop policy if exists "task_attachments_insert" on storage.objects;
create policy "task_attachments_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'task-attachments'
    and (
      public.is_chairman()
      or exists (
        select 1 from tasks t
        join agents a on a.id = t.agent_id
        where t.id::text = (storage.foldername(name))[1]
          and t.created_by = auth.uid()
          and a.business_unit_id = public.current_user_business_unit_id()
      )
    )
  );

drop policy if exists "task_attachments_select" on storage.objects;
create policy "task_attachments_select" on storage.objects
  for select to authenticated using (
    bucket_id = 'task-attachments'
    and (
      public.is_chairman()
      or exists (
        select 1 from tasks t
        join agents a on a.id = t.agent_id
        where t.id::text = (storage.foldername(name))[1]
          and a.business_unit_id = public.current_user_business_unit_id()
      )
    )
  );

drop policy if exists "task_attachments_delete" on storage.objects;
create policy "task_attachments_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'task-attachments'
    and (
      public.is_chairman()
      or exists (
        select 1 from tasks t
        join agents a on a.id = t.agent_id
        where t.id::text = (storage.foldername(name))[1]
          and a.business_unit_id = public.current_user_business_unit_id()
      )
    )
  );
