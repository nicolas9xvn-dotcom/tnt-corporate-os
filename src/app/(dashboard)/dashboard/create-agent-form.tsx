"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createAgent } from "@/lib/actions/command-center";

export function CreateAgentForm({ departmentId }: { departmentId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await createAgent(departmentId, new FormData(event.currentTarget));

    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs text-slate-500 underline decoration-dotted transition hover:text-sky-300"
      >
        + Thêm agent
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/60 p-3"
    >
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-semibold text-slate-300">Thêm agent</h5>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Huỷ
        </button>
      </div>

      <input
        name="name"
        required
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
        placeholder="Tên agent"
      />
      <input
        name="role"
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
        placeholder="Vai trò (tuỳ chọn), ví dụ: Trưởng phòng Marketing"
      />
      <textarea
        name="system_prompt"
        rows={3}
        className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
        placeholder="System prompt (tuỳ chọn) — TODO: chưa được dùng để gọi Claude API"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Tạo agent"}
      </button>
    </form>
  );
}
