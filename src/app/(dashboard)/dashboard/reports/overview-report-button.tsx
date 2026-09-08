"use client";

import { useState, useTransition } from "react";
import { generateBusinessOverviewReport } from "@/lib/actions/reports";

export function OverviewReportButton({
  businessUnitId,
  ceoAgentId,
  ceoName,
}: {
  businessUnitId: string;
  ceoAgentId: string;
  ceoName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function handleClick() {
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await generateBusinessOverviewReport(businessUnitId, ceoAgentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDone(true);
    });
  }

  return (
    <div className="mt-4 flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? `${ceoName} đang tổng hợp...` : "Tạo báo cáo tổng quan tự động"}
      </button>
      {done && <p className="text-[0.7rem] text-emerald-400">Đã tạo — xem trong danh sách bên dưới.</p>}
      {error && <p className="text-[0.7rem] text-red-400">{error}</p>}
    </div>
  );
}
