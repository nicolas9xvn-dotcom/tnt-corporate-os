"use client";

import { useState, type FormEvent } from "react";
import { runAgentTask } from "@/lib/actions/run-task";

export function RunTaskForm({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOutput(null);
    setPending(true);

    const result = await runAgentTask(agentId, input);

    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOutput(result.output ?? "");
  }

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <p className="hud-eyebrow text-[0.65rem]">Giao việc</p>
      <form onSubmit={handleSubmit} className="mt-1.5 flex flex-col gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          required
          placeholder="Việc cần làm là gì?"
          className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Agent đang xử lý..." : "Gửi"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

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
