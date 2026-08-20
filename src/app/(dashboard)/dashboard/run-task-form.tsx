"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { runAgentTask, type RunTaskAttachment } from "@/lib/actions/run-task";

const MAX_FILES = 3;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4MB per file
// Combined raw size cap: base64 inflates by ~1.33x, and the server action
// body limit is 8MB total (next.config.ts) — 5MB raw stays safely under
// that once encoded, leaving room for the text fields too.
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix — Gemini wants raw base64.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const needsApproval = (approvalLevel ?? 1) >= 2;

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setError(null);

    if (picked.length > MAX_FILES) {
      setError(`Tối đa ${MAX_FILES} file mỗi lần.`);
      return;
    }
    const tooBig = picked.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`File "${tooBig.name}" quá 4MB — chọn file nhỏ hơn.`);
      return;
    }
    const totalBytes = picked.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      setError(`Tổng dung lượng file vượt quá ${MAX_TOTAL_BYTES / (1024 * 1024)}MB — chọn ít file/nhỏ hơn.`);
      return;
    }
    setFiles(picked);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOutput(null);
    setPendingApproval(false);
    setPending(true);

    try {
      const attachments: RunTaskAttachment[] = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          base64: await readAsBase64(file),
        }))
      );

      const result = await runAgentTask(agentId, input, attachments);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.pendingApproval) {
        setPendingApproval(true);
        setInput("");
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setOutput(result.output ?? "");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      setError("Không đọc được file đính kèm — thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <p className="hud-eyebrow text-[0.65rem]">Giao việc</p>
      <p className="mt-1 text-[0.7rem] text-slate-500">
        Agent nhớ nội dung + kết quả của 8 lần giao việc gần nhất — có thể chia nhỏ việc lớn
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
          {pending ? "Agent đang xử lý..." : "Gửi"}
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
