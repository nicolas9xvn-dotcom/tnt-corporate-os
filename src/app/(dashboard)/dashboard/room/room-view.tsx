"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendCoordinationMessage, stopTaskSession } from "@/lib/actions/coordination";
import { MarkdownOutput, SpeakButton } from "../agent-output";
import type { TaskStatus } from "@/lib/types";

export interface SessionSummary {
  id: string;
  agent_id: string;
  input: string | null;
  status: TaskStatus;
  created_at: string;
  agents: { name: string } | null;
}

interface ThreadTaskRow {
  id: string;
  agent_id: string;
  parent_task_id: string | null;
  input: string | null;
  output: string | null;
  status: TaskStatus;
  created_at: string;
  agents: { name: string } | null;
}

interface ThreadMessageRow {
  id: string;
  text: string;
  created_at: string;
}

type ThreadItem =
  | { kind: "task"; id: string; createdAt: string; task: ThreadTaskRow }
  | { kind: "message"; id: string; createdAt: string; text: string };

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Đang chuẩn bị",
  in_progress: "Đang xử lý...",
  approval_required: "Chờ duyệt",
  done: "Xong",
  failed: "Lỗi",
  rejected: "Đã dừng/từ chối",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  pending: "bg-slate-800 text-slate-400",
  in_progress: "animate-pulse bg-cyan-950/60 text-cyan-300",
  approval_required: "bg-violet-950/60 text-violet-300",
  done: "bg-emerald-950/60 text-emerald-300",
  failed: "bg-red-950/60 text-red-300",
  rejected: "bg-amber-950/60 text-amber-300",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "medium" });
}

export function RoomView({
  agents,
  initialSessions,
}: {
  businessUnitId: string;
  agents: { id: string; name: string }[];
  initialSessions: SessionSummary[];
}) {
  const [sessions, setSessions] = useState<SessionSummary[]>(initialSessions);
  const [selectedId, setSelectedId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [threadTasks, setThreadTasks] = useState<ThreadTaskRow[]>([]);
  const [threadMessages, setThreadMessages] = useState<ThreadMessageRow[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const agentIds = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const agentNameById = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents]);

  // Reload the full transcript for whichever session is selected — cheap
  // (a handful of rows per session) and simpler than reconciling partial
  // realtime payloads into thread state by hand.
  async function loadThread(rootTaskId: string) {
    setLoadingThread(true);
    const supabase = createClient();
    const [{ data: tasks }, { data: messages }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, agent_id, parent_task_id, input, output, status, created_at, agents(name)")
        .eq("root_task_id", rootTaskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("task_messages")
        .select("id, text, created_at")
        .eq("root_task_id", rootTaskId)
        .order("created_at", { ascending: true }),
    ]);
    setThreadTasks((tasks as unknown as ThreadTaskRow[]) ?? []);
    setThreadMessages(messages ?? []);
    setLoadingThread(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedId) void loadThread(selectedId);
      else {
        setThreadTasks([]);
        setThreadMessages([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedId]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("room-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, (payload) => {
        const row = (payload.new ?? payload.old) as {
          id: string;
          agent_id: string;
          root_task_id: string | null;
          parent_task_id: string | null;
        };
        if (!agentIds.has(row.agent_id)) return;

        if (row.parent_task_id === null) {
          const full = payload.new as SessionSummary | undefined;
          if (full) {
            setSessions((prev) => {
              const withoutOld = prev.filter((s) => s.id !== full.id);
              return [{ ...full, agents: { name: agentNameById.get(full.agent_id) ?? "?" } }, ...withoutOld].slice(
                0,
                20
              );
            });
          }
        }

        setSelectedId((current) => {
          if (current && row.root_task_id === current) {
            void loadThread(current);
          }
          return current;
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_messages" }, (payload) => {
        const row = payload.new as { root_task_id: string };
        setSelectedId((current) => {
          if (current && row.root_task_id === current) {
            void loadThread(current);
          }
          return current;
        });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [agentIds, agentNameById]);

  const items: ThreadItem[] = useMemo(() => {
    const taskItems: ThreadItem[] = threadTasks.map((t) => ({ kind: "task", id: t.id, createdAt: t.created_at, task: t }));
    const messageItems: ThreadItem[] = threadMessages.map((m) => ({
      kind: "message",
      id: m.id,
      createdAt: m.created_at,
      text: m.text,
    }));
    return [...taskItems, ...messageItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [threadTasks, threadMessages]);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;
  const isLive = selectedSession?.status === "in_progress" || selectedSession?.status === "pending";

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !messageText.trim()) return;
    setSending(true);
    setActionError(null);
    const result = await sendCoordinationMessage(selectedId, messageText);
    if (result.error) setActionError(result.error);
    else {
      setMessageText("");
      await loadThread(selectedId);
    }
    setSending(false);
  }

  async function handleStop() {
    if (!selectedId) return;
    setStopping(true);
    setActionError(null);
    const result = await stopTaskSession(selectedId);
    if (result.error) setActionError(result.error);
    setStopping(false);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
      <div className="hud-panel rounded-lg p-3">
        <p className="hud-eyebrow px-1 text-[0.65rem]">Các phiên giao việc gần đây</p>
        <div className="mt-2 flex max-h-[560px] flex-col gap-1.5 overflow-y-auto">
          {sessions.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">Chưa có phiên nào.</p>}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`rounded-md border px-2.5 py-2 text-left text-xs transition ${
                s.id === selectedId
                  ? "border-cyan-600 bg-cyan-950/50 text-slate-100"
                  : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-cyan-900"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-cyan-300">{s.agents?.name ?? agentNameById.get(s.agent_id) ?? "?"}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] ${STATUS_STYLE[s.status]}`}>
                  {STATUS_LABELS[s.status]}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-slate-500">{s.input}</p>
              <p className="mt-1 text-[0.65rem] text-slate-600">{formatTime(s.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="hud-panel flex min-h-[560px] flex-col rounded-lg p-4">
        {!selectedId ? (
          <p className="m-auto text-sm text-slate-500">Chọn 1 phiên bên trái để xem trao đổi.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 overflow-y-auto pr-1" style={{ maxHeight: "440px" }}>
              {loadingThread && <p className="text-xs text-slate-500">Đang tải...</p>}
              {items.map((item) =>
                item.kind === "task" ? (
                  <div key={item.id} className="rounded-md border border-cyan-900/40 bg-slate-950/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-cyan-300">
                        {item.task.agents?.name ?? agentNameById.get(item.task.agent_id) ?? "?"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${STATUS_STYLE[item.task.status]}`}>
                          {STATUS_LABELS[item.task.status]}
                        </span>
                        <span className="text-[0.65rem] text-slate-600">{formatTime(item.task.created_at)}</span>
                      </div>
                    </div>
                    {item.task.input && (
                      <p className="mt-1.5 text-xs italic text-slate-500">Được giao: {item.task.input}</p>
                    )}
                    {item.task.output && (
                      <div className="mt-1.5 border-t border-slate-800/80 pt-1.5">
                        <div className="flex justify-end">
                          <SpeakButton text={item.task.output} />
                        </div>
                        <MarkdownOutput content={item.task.output} className="text-sm leading-relaxed text-slate-200" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="ml-4 rounded-md border border-amber-800/50 bg-amber-950/20 p-2.5 text-xs text-amber-200"
                  >
                    <span className="font-semibold">Bạn (điều phối):</span> {item.text}
                    <span className="ml-2 text-[0.65rem] text-amber-500/70">{formatTime(item.createdAt)}</span>
                  </div>
                )
              )}
              {!loadingThread && items.length === 0 && <p className="text-xs text-slate-500">Chưa có nội dung.</p>}
            </div>

            <div className="mt-3 border-t border-slate-800 pt-3">
              {actionError && <p className="mb-2 text-xs text-red-400">{actionError}</p>}
              <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={
                    isLive
                      ? "Gõ chỉ đạo thêm giữa chừng — agent đang chạy sẽ nhận ở lượt xử lý tiếp theo..."
                      : "Phiên này đã xong — vẫn ghi chú lại được nếu cần."
                  }
                  className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Gửi
                  </button>
                  {isLive && (
                    <button
                      type="button"
                      onClick={handleStop}
                      disabled={stopping}
                      className="rounded-md border border-red-700 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-950/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {stopping ? "Đang dừng..." : "Dừng ngay"}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
