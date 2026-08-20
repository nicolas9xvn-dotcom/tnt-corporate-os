-- Lets an agent hand off part of a task to its own direct reports (via
-- Gemini function calling in src/lib/actions/agent-runner.ts) — e.g. giao
-- việc cho CEO AME29, CEO tự quyết định giao lại cho đúng agent cấp dưới,
-- rồi tổng hợp kết quả trả về. Each delegated hand-off is a real task row
-- for the receiving agent (same rules, same memory, same audit trail) —
-- parent_task_id just links it back to the task that spawned it.

alter table tasks add column if not exists parent_task_id uuid references tasks (id) on delete set null;
create index if not exists tasks_parent_task_id_idx on tasks (parent_task_id);
