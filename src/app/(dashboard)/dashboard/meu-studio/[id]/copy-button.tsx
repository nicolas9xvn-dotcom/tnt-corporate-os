"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="shrink-0 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-cyan-500 hover:text-cyan-300"
    >
      {copied ? "Đã copy ✓" : "Copy"}
    </button>
  );
}
