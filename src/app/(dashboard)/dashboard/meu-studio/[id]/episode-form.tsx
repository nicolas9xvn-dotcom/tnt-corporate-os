"use client";

import { useState, type FormEvent } from "react";
import { updateEpisode, type EpisodeFields } from "@/lib/actions/meu-studio";
import { EPISODE_STATUSES, OPTIONAL_REFS, SIGNATURE_STATES } from "@/lib/meu-studio";

const INPUT =
  "rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500";

export function EpisodeForm({ episode }: { episode: EpisodeFields & { id: string } }) {
  const [fields, setFields] = useState<EpisodeFields>(episode);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof EpisodeFields>(key: K, value: EpisodeFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function toggleRef(value: string) {
    set("refs", fields.refs.includes(value) ? fields.refs.filter((r) => r !== value) : [...fields.refs, value]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const result = await updateEpisode(episode.id, fields);
    setPending(false);
    setMessage(result.error ? { ok: false, text: result.error } : { ok: true, text: "Đã lưu." });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-3">
          Tên tập
          <input value={fields.title} onChange={(e) => set("title", e.target.value)} className={INPUT} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Signature State
          <select value={fields.signature_state} onChange={(e) => set("signature_state", e.target.value)} className={INPUT}>
            {SIGNATURE_STATES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Trạng thái
          <select value={fields.status} onChange={(e) => set("status", e.target.value)} className={INPUT}>
            {EPISODE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-400">
          Ảnh tham chiếu thêm
          <div className="flex flex-wrap gap-3 py-2">
            {OPTIONAL_REFS.map((r) => (
              <label key={r.value} className="flex items-center gap-1.5 text-sm text-slate-200">
                <input type="checkbox" checked={fields.refs.includes(r.value)} onChange={() => toggleRef(r.value)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Tóm tắt (tiếng Việt, để nhóm hiểu ý tưởng: tự tin → sự cố → vẫn chảnh)
        <textarea value={fields.synopsis} onChange={(e) => set("synopsis", e.target.value)} rows={2} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Bối cảnh (tiếng Anh — VD: a pink-and-white nail table, soft pink front light)
        <input value={fields.setting} onChange={(e) => set("setting", e.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Âm thanh (tiếng Anh — VD: upbeat beat, filing scrapes on the beat, off-screen crash)
        <input value={fields.sound} onChange={(e) => set("sound", e.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Chữ overlay 大阪弁 (chèn trong CapCut)
        <input value={fields.overlay_text} onChange={(e) => set("overlay_text", e.target.value)} className={INPUT} />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : "Lưu tập"}
        </button>
        {message && <p className={message.ok ? "text-xs text-emerald-400" : "text-xs text-red-400"}>{message.text}</p>}
      </div>
    </form>
  );
}
