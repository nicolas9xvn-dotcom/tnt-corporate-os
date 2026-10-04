"use client";

import { useState, type FormEvent } from "react";
import { addShot, deleteShot } from "@/lib/actions/meu-studio";

const INPUT =
  "rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";

interface Shot {
  id: string;
  position: number;
  framing: string | null;
  action: string;
}

export function ShotsPanel({ episodeId, shots }: { episodeId: string; shots: Shot[] }) {
  const [framing, setFraming] = useState("");
  const [action, setAction] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await addShot(episodeId, framing, action);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setFraming("");
    setAction("");
  }

  async function handleDelete(id: string) {
    const result = await deleteShot(id, episodeId);
    if (result.error) setError(result.error);
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      {shots.length > 0 && (
        <ol className="flex flex-col gap-2">
          {shots.map((shot, i) => (
            <li key={shot.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
              <div>
                <p className="text-xs text-cyan-300">
                  Shot {i + 1}
                  {shot.framing && <span className="text-slate-500"> · {shot.framing}</span>}
                </p>
                <p className="mt-0.5 text-slate-200">{shot.action}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(shot.id)}
                className="shrink-0 text-xs text-slate-500 transition hover:text-red-400"
              >
                Xoá
              </button>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          value={framing}
          onChange={(e) => setFraming(e.target.value)}
          placeholder="Khung hình + máy quay (tiếng Anh — VD: medium shot, static camera)"
          className={INPUT}
        />
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          rows={2}
          placeholder="1 hành động chính, cảm xúc + 1 chi tiết cơ thể (tiếng Anh — VD: Pleased with herself, she flicks the file over her shoulder out of frame.)"
          className={INPUT}
        />
        <button
          type="submit"
          disabled={pending || !action.trim()}
          className="self-start rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Đang thêm..." : "+ Thêm shot"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </div>
  );
}
