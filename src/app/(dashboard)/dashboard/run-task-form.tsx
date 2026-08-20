"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { runAgentTask, createTaskDraft, cancelTaskDraft } from "@/lib/actions/run-task";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET, sanitizeFileName } from "@/lib/attachments";
import type { TaskAttachment } from "@/lib/types";

const MAX_FILES = 5;
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB per file

export function RunTaskForm({
  agentId,
  approvalLevel,
}: {
  agentId: string;
  approvalLevel: number | null;
}) {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsApproval = (approvalLevel ?? 1) >= 2;
  const pending = phase !== "idle";

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setError(null);

    if (picked.length > MAX_FILES) {
      setError(`Tối đa ${MAX_FILES} file mỗi lần.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`File "${tooBig.name}" quá ${MAX_FILE_BYTES / (1024 * 1024)}MB — chọn file nhỏ hơn.`);
      return;
    }
    setFiles(picked);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetFiles() {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOutput(null);
    setPendingApproval(false);

    let draftTaskId: string | undefined;

    try {
      const uploaded: TaskAttachment[] = [];

      if (files.length > 0) {
        setPhase("uploading");
        const draft = await createTaskDraft(agentId);
        if (draft.error || !draft.taskId) {
          setError(draft.error ?? "Không tạo được task.");
          return;
        }
        draftTaskId = draft.taskId;

        const supabase = createClient();
        for (const file of files) {
          const path = `${draft.taskId}/${sanitizeFileName(file.name)}`;
          const mimeType = file.type || "application/octet-stream";
          const { error: uploadError } = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, file, { contentType: mimeType, upsert: true });
          if (uploadError) {
            setError(`Upload file "${file.name}" thất bại: ${uploadError.message}`);
            await cancelTaskDraft(draft.taskId);
            return;
          }
          uploaded.push({ path, name: file.name, mimeType });
        }
      }

      setPhase("processing");
      const result = await runAgentTask(agentId, input, uploaded, draftTaskId);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.pendingApproval) {
        setPendingApproval(true);
        setInput("");
        resetFiles();
        return;
      }
      setOutput(result.output ?? "");
      resetFiles();
    } catch {
      setError("Có lỗi khi xử lý file — thử lại.");
      if (draftTaskId) await cancelTaskDraft(draftTaskId);
    } finally {
      setPhase("idle");
    }
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <p className="hud-eyebrow text-[0.65rem]">Giao việc</p>
      <p className="mt-1 text-[0.7rem] text-slate-500">
        Agent nhớ nội dung + kết quả của 20 lần giao việc gần nhất — có thể chia nhỏ việc lớn
        ra nhiều lần gửi, lần sau agent vẫn nhớ các lần trước.
      </p>
      <form onSubmit={handleSubmit} className="mt-1.5 flex flex-col gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="Việc cần làm là gì? Có thể dán link website vào đây, agent sẽ tự đọc."
          className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />

        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.csv"
            onChange={handleFilesChange}
            className="block w-full text-xs text-slate-400 file:mr-2 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:text-slate-300 hover:file:border-cyan-700"
          />
          {files.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-1.5 rounded-md border border-cyan-900/40 bg-slate-900/60 px-2 py-1 text-[0.7rem] text-slate-300"
                >
                  {file.name}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-slate-500 hover:text-red-400"
                    aria-label={`Bỏ file ${file.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {needsApproval && (
            <p className="mt-1.5 text-[0.7rem] italic text-slate-600">
              Agent này cần duyệt trước khi chạy — file sẽ được lưu tạm và chỉ gửi cho AI sau
              khi có người duyệt.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending || (!input.trim() && files.length === 0)}
          className="self-start rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "uploading" ? "Đang tải file lên..." : phase === "processing" ? "Agent đang xử lý..." : "Gửi"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {pendingApproval && (
        <p className="mt-2 text-xs text-violet-300">
          Agent này cần duyệt trước khi chạy — đã gửi vào mục &quot;Chờ duyệt&quot; ở đầu trang.
        </p>
      )}

      {output && (
        <div className="mt-2">
          <p className="hud-eyebrow text-[0.65rem]">Kết quả</p>
          <p className="mt-1 whitespace-pre-line rounded-md border border-cyan-900/40 bg-slate-950/60 p-2.5 text-sm leading-relaxed text-slate-200">
            {output}
          </p>
        </div>
      )}
    </div>
  );
}
