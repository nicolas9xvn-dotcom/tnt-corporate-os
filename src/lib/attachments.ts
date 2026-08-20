// Shared between the browser (direct upload in run-task-form.tsx) and the
// server (approvals.ts, run-task.ts) so both sides agree on the bucket name
// and the same filename sanitization, keeping storage paths consistent.
export const ATTACHMENTS_BUCKET = "task-attachments";

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}
