"use client";

import { useState, useTransition } from "react";
import { addKnowledgeEntry } from "@/lib/actions/knowledge";

export function KnowledgeForm({
  businessUnitId,
  departments,
}: {
  businessUnitId: string;
  departments: { id: string; name: string }[];
}) {
  const [text, setText] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addKnowledgeEntry(businessUnitId, text, departmentId || null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setText("");
      setDepartmentId("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Ghi lại 1 kinh nghiệm, quy trình, hay lưu ý cần nhớ..."
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <div className="flex items-center gap-2">
        {departments.length > 0 && (
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300"
          >
            <option value="">Không gắn phòng ban</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
