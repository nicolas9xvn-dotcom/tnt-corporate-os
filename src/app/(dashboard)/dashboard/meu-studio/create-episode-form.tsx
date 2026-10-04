"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createEpisode } from "@/lib/actions/meu-studio";
import { SIGNATURE_STATES } from "@/lib/meu-studio";

export function CreateEpisodeForm({ businessUnitId }: { businessUnitId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [state, setState] = useState(SIGNATURE_STATES[0].value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createEpisode(businessUnitId, title, state);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.id) router.push(`/dashboard/meu-studio/${result.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tên tập mới (VD: Dũa theo beat)"
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <select
        value={state}
        onChange={(e) => setState(e.target.value)}
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      >
        {SIGNATURE_STATES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !title.trim()}
        className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang tạo..." : "+ Tạo tập"}
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </form>
  );
}
