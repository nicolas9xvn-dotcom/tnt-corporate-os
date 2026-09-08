"use client";

import { useState, useTransition } from "react";
import { addDecision } from "@/lib/actions/decisions";

const EMPTY = { title: "", context: "", recommendation: "", decision: "", reason: "" };

export function DecisionForm() {
  const [fields, setFields] = useState(EMPTY);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof typeof EMPTY, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addDecision(fields);
      if (result.error) {
        setError(result.error);
        return;
      }
      setFields(EMPTY);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <input
        value={fields.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder="Tiêu đề quyết định"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <textarea
        value={fields.context}
        onChange={(e) => update("context", e.target.value)}
        rows={2}
        placeholder="Bối cảnh"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <textarea
        value={fields.recommendation}
        onChange={(e) => update("recommendation", e.target.value)}
        rows={2}
        placeholder="Đề xuất"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <textarea
        value={fields.decision}
        onChange={(e) => update("decision", e.target.value)}
        rows={2}
        placeholder="Quyết định cuối cùng"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <textarea
        value={fields.reason}
        onChange={(e) => update("reason", e.target.value)}
        rows={2}
        placeholder="Lý do"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={pending || !fields.title.trim()}
        className="self-start rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Ghi quyết định"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
