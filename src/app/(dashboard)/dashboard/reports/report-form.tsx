"use client";

import { useState, useTransition } from "react";
import { addReport } from "@/lib/actions/reports";

export function ReportForm({ businessUnitId }: { businessUnitId: string }) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addReport(businessUnitId, text);
      if (result.error) {
        setError(result.error);
        return;
      }
      setText("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Hoặc tự viết báo cáo bằng tay..."
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-700 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Lưu báo cáo"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
