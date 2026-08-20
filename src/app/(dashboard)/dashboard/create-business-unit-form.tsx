"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createBusinessUnit } from "@/lib/actions/command-center";

export function CreateBusinessUnitForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await createBusinessUnit(new FormData(event.currentTarget));

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
        className="self-start rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-sky-600 hover:text-sky-300"
      >
        + Thêm công ty con
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Thêm công ty con</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Huỷ
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bu-name" className="text-xs font-medium text-slate-400">
          Tên công ty con
        </label>
        <input
          id="bu-name"
          name="name"
          required
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
          placeholder="Ví dụ: AME29"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bu-ceo-title" className="text-xs font-medium text-slate-400">
          Chức danh CEO (tuỳ chọn)
        </label>
        <input
          id="bu-ceo-title"
          name="ceo_title"
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
          placeholder="Ví dụ: CEO AME29"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="bu-status" className="text-xs font-medium text-slate-400">
          Trạng thái
        </label>
        <select
          id="bu-status"
          name="status"
          defaultValue="coming_soon"
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500"
        >
          <option value="coming_soon">Sắp triển khai</option>
          <option value="active">Đang hoạt động</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang lưu..." : "Tạo công ty con"}
      </button>
    </form>
  );
}
