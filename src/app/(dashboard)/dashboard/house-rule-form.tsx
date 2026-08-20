"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { setHouseRule, clearHouseRule } from "@/lib/actions/house-rules";
import { createTaskDraft, cancelTaskDraft } from "@/lib/actions/run-task";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENTS_BUCKET, sanitizeFileName } from "@/lib/attachments";
import type { TaskAttachment } from "@/lib/types";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function HouseRuleForm({
  agentId,
  currentRule,
  hasDirectReports,
}: {
  agentId: string;
  currentRule: string | null;
  hasDirectReports: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [cascade, setCascade] = useState(hasDirectReports);
  const [savedRule, setSavedRule] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing" | "clearing">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setError(`File "${tooBig.name}" quá ${MAX_FILE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setFiles(picked);
  }

  function resetForm() {
    setInput("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavedRule(null);

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
      const result = await setHouseRule(agentId, input, uploaded, draftTaskId, cascade);

      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedRule(result.derivedRule ?? null);
      resetForm();
    } catch {
      setError("Có lỗi khi xử lý — thử lại.");
      if (draftTaskId) await cancelTaskDraft(draftTaskId);
    } finally {
      setPhase("idle");
    }
  }

  async function handleClear() {
    setError(null);
    setPhase("clearing");
    const result = await clearHouseRule(agentId);
    setPhase("idle");
    if (result.error) {
      setError(result.error);
      return;
    }
    setSavedRule(null);
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <p className="hud-eyebrow text-[0.65rem]">Quy tắc cố định</p>
        <span className="text-xs text-slate-500">{open ? "▾" : "▸"}</span>
      </button>

      {!open && currentRule && (
        <p className="mt-1 text-[0.7rem] text-emerald-400/80">Đang áp dụng 1 quy tắc cố định.</p>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {currentRule && (
            <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.65rem] font-semibold text-emerald-400">Quy tắc đang áp dụng</p>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={pending}
                  className="text-[0.65rem] text-slate-500 hover:text-red-400 disabled:opacity-50"
                >
                  {phase === "clearing" ? "Đang xoá..." : "Xoá quy tắc"}
                </button>
              </div>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-300">{currentRule}</p>
            </div>
          )}

          <p className="text-[0.7rem] text-slate-500">
            Đặt 1 chuẩn mực cố định cho agent này (VD: cách viết caption theo 1 mẫu ảnh) — áp
            dụng cho MỌI lần giao việc sau này, không tự đổi cho tới khi bạn đặt lại.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="Mô tả quy tắc, kèm ảnh mẫu nếu có (VD: luôn viết caption ngắn gọn, có emoji, theo phong cách ảnh này)."
              className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.csv"
              onChange={handleFilesChange}
              className="block w-full text-xs text-slate-400 file:mr-2 file:rounded-md file:border file:border-slate-700 file:bg-slate-900 file:px-2 file:py-1 file:text-xs file:text-slate-300 hover:file:border-emerald-700"
            />
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="rounded-md border border-emerald-900/40 bg-slate-900/60 px-2 py-1 text-[0.7rem] text-slate-300"
                  >
                    {f.name}
                  </li>
                ))}
              </ul>
            )}

            {hasDirectReports && (
              <label className="flex items-center gap-1.5 text-[0.7rem] text-slate-400">
                <input
                  type="checkbox"
                  checked={cascade}
                  onChange={(e) => setCascade(e.target.checked)}
                  className="accent-emerald-500"
                />
                Áp dụng cho tất cả agent cấp dưới (toàn bộ nhóm)
              </label>
            )}

            <button
              type="submit"
              disabled={pending || (!input.trim() && files.length === 0)}
              className="self-start rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {phase === "uploading" ? "Đang tải file lên..." : phase === "processing" ? "Đang chốt quy tắc..." : "Lưu quy tắc"}
            </button>
          </form>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {savedRule && (
            <div className="rounded-md border border-emerald-900/40 bg-slate-950/60 p-2.5">
              <p className="text-[0.65rem] font-semibold text-emerald-400">Đã lưu — quy tắc AI chốt lại</p>
              <p className="mt-1 whitespace-pre-line text-xs text-slate-300">{savedRule}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
