-- TNT AI Corporate OS — Task approval workflow
-- Adds the two statuses the approval flow needs: a task waiting on a human
-- approve/reject decision, and one that was explicitly rejected (distinct
-- from "failed", which means the model/API call itself errored out).

alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('pending', 'in_progress', 'approval_required', 'done', 'failed', 'rejected'));
