"use client";

import { useState, type FormEvent } from "react";
import { addContentCalendarItem } from "@/lib/actions/content-calendar";

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "google_maps", label: "Google Maps" },
  { value: "khac", label: "Khác" },
];

export function CalendarForm({ businessUnitId }: { businessUnitId: string }) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [scheduledDate, setScheduledDate] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await addContentCalendarItem(businessUnitId, title, platform, scheduledDate, notes);
    if (result.error) setError(result.error);
    else {
      setTitle("");
      setNotes("");
      setScheduledDate("");
    }
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Tiêu đề content/chiến dịch (VD: Video giới thiệu mẫu nail Giáng sinh)"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
        >
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
        />
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Ghi chú thêm (tuỳ chọn)"
        className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={pending || !title.trim() || !scheduledDate}
        className="self-start rounded-md bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Thêm vào lịch"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
