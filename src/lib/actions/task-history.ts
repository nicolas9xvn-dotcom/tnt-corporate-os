"use server";

import { createClient } from "@/lib/supabase/server";
import { createFileDownloadUrl } from "./file-downloads";

// Solves the "closed the tab before I finished reading" problem: every
// task's input/output was already being persisted to `tasks` (that's what
// powers the agent's rolling memory, see agent-history.ts) — this just
// surfaces that same data back in the UI instead of it only ever existing
// as ephemeral React state in run-task-form.tsx, gone the moment the panel
// unmounts. RLS (tasks_select, migration 0002) already scopes results to
// the caller's own business unit, so no extra permission check needed here.
const HISTORY_LIMIT = 30;

export interface TaskHistoryItem {
  id: string;
  input: string;
  output: string | null;
  status: string;
  createdAt: string;
  imageDownloadUrl?: string;
  fileDownloadUrl?: string;
  fileName?: string;
}

export async function getAgentTaskHistory(agentId: string): Promise<{ items: TaskHistoryItem[]; error: string | null }> {
  const supabase = await createClient();
  if (!supabase) return { items: [], error: "Supabase chưa được cấu hình." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { items: [], error: "Bạn cần đăng nhập." };

  const { data, error } = await supabase
    .from("tasks")
    .select("id, input, output, status, output_image_path, output_file_path, output_file_name, created_at")
    .eq("agent_id", agentId)
    .in("status", ["done", "failed", "rejected"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) return { items: [], error: error.message };

  const items = await Promise.all(
    (data ?? []).map(async (row): Promise<TaskHistoryItem> => {
      const item: TaskHistoryItem = {
        id: row.id,
        input: row.input ?? "",
        output: row.output,
        status: row.status,
        createdAt: row.created_at,
      };
      if (row.output_image_path) {
        const url = await createFileDownloadUrl(supabase, row.output_image_path);
        if (url) item.imageDownloadUrl = url;
      }
      if (row.output_file_path) {
        const url = await createFileDownloadUrl(supabase, row.output_file_path);
        if (url) {
          item.fileDownloadUrl = url;
          item.fileName = row.output_file_name ?? "file";
        }
      }
      return item;
    })
  );

  return { items, error: null };
}
