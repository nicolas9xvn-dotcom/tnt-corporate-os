"use client";

import { useState } from "react";
import { disconnectSocialAccount } from "@/lib/actions/social-accounts";

export function DisconnectButton({ accountId }: { accountId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm("Gỡ kết nối tài khoản này? Các bài đã đăng vẫn giữ nguyên trên nền tảng.")) return;
    setPending(true);
    setError(null);
    const result = await disconnectSocialAccount(accountId);
    if (result.error) setError(result.error);
    setPending(false);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-md border border-red-900/50 px-2 py-0.5 text-[0.65rem] text-red-300 hover:border-red-600 disabled:opacity-60"
      >
        {pending ? "Đang gỡ..." : "Gỡ kết nối"}
      </button>
      {error && <span className="text-[0.6rem] text-red-400">{error}</span>}
    </span>
  );
}
