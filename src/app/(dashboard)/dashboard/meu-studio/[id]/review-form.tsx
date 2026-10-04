"use client";

import { useState, type FormEvent } from "react";
import { addClipReview } from "@/lib/actions/meu-studio";
import { QC_ITEMS, qcPassed } from "@/lib/meu-studio";

const INPUT =
  "rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";

export function ReviewForm({ episodeId, episodeCode }: { episodeId: string; episodeCode: string }) {
  const [label, setLabel] = useState(`${episodeCode}-1`);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await addClipReview(episodeId, label, checks, notes);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setChecks({});
    setNotes("");
  }

  const passed = qcPassed(checks);

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Tên clip (VD: T07-v2-1)"
        className={INPUT}
      />
      <div className="grid gap-1.5 sm:grid-cols-2">
        {QC_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={checks[item.key] === true}
              onChange={(e) => setChecks((prev) => ({ ...prev, [item.key]: e.target.checked }))}
            />
            <span>
              {item.blocking ? "🔴" : "🟡"} {item.label}
            </span>
          </label>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Ghi chú lỗi (VD: kẹp tóc thành chùm hoa, mắt đỏ)"
        className={INPUT}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !label.trim()}
          className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : "Lưu kết quả duyệt"}
        </button>
        <span className={passed ? "text-xs text-emerald-400" : "text-xs text-red-400"}>
          {passed ? "Đạt — đủ các mục 🔴" : "Loại — còn mục 🔴 chưa tick"}
        </span>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
