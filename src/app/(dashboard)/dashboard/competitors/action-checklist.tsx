"use client";

import { useState, useTransition } from "react";
import { toggleCompetitorAction } from "@/lib/actions/competitors";

export interface ActionItem {
  id: string;
  description: string;
  done: boolean;
}

export function ActionChecklist({
  businessUnitId,
  actions,
  editable,
}: {
  businessUnitId: string;
  actions: ActionItem[];
  editable: boolean;
}) {
  const [items, setItems] = useState(actions);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle(id: string, done: boolean) {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, done } : a)));
    setError(null);
    startTransition(async () => {
      const result = await toggleCompetitorAction(businessUnitId, id, done);
      if (result.error) {
        setError(result.error);
        setItems((prev) => prev.map((a) => (a.id === id ? { ...a, done: !done } : a)));
      }
    });
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-400">Đề xuất hành động</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((a) => (
          <li key={a.id} className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={a.done}
              disabled={!editable || pending}
              onChange={(e) => handleToggle(a.id, e.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />
            <span className={a.done ? "text-slate-500 line-through" : "text-slate-300"}>{a.description}</span>
          </li>
        ))}
      </ul>
      {error && <p className="mt-1.5 text-[0.7rem] text-red-400">{error}</p>}
    </div>
  );
}
