"use client";

import { useState, type FormEvent } from "react";
import { publishCalendarItemWithSetup } from "@/lib/actions/social-publish";

interface AssetOption {
  id: string;
  asset_code: string;
  category: string | null;
  file_type: string;
}

interface AccountOption {
  id: string;
  account_name: string;
}

interface CalendarItem {
  id: string;
  platform: string;
  content_asset_id: string | null;
  caption: string | null;
  social_account_id: string | null;
  status: string;
  external_post_id: string | null;
  permalink: string | null;
  publish_error: string | null;
  likes_count: number | null;
  comments_count: number | null;
  shares_count: number | null;
  views_count: number | null;
}

// Only rendered for platforms with a real API integration
// (facebook/instagram/tiktok) — content-calendar/page.tsx skips this for
// google_maps/khac, which stay on the old manual StatusButton only.
export function PublishPanel({ item, assets, accounts }: { item: CalendarItem; assets: AssetOption[]; accounts: AccountOption[] }) {
  const [contentAssetId, setContentAssetId] = useState(item.content_asset_id ?? "");
  const [caption, setCaption] = useState(item.caption ?? "");
  const [socialAccountId, setSocialAccountId] = useState(item.social_account_id ?? accounts[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(item.publish_error);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await publishCalendarItemWithSetup(item.id, contentAssetId, caption, socialAccountId);
    if (result.error) setError(result.error);
    setPending(false);
  }

  if (item.status === "posted" && item.external_post_id) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-md border border-emerald-900/50 bg-emerald-950/30 px-2.5 py-1.5 text-xs text-emerald-300">
        <span>Đã đăng thật</span>
        {item.likes_count !== null && <span>👍 {item.likes_count}</span>}
        {item.comments_count !== null && <span>💬 {item.comments_count}</span>}
        {item.shares_count !== null && <span>🔁 {item.shares_count}</span>}
        {item.views_count !== null && <span>👁 {item.views_count}</span>}
        {item.permalink && (
          <a href={item.permalink} target="_blank" rel="noreferrer" className="underline">
            Xem bài đăng
          </a>
        )}
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <p className="mt-2 text-xs text-amber-400">
        Chưa kết nối tài khoản {item.platform} nào — vào trang &quot;Kênh MXH&quot; để kết nối trước khi đăng.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-2 rounded-md border border-slate-800 bg-slate-950/40 p-2.5">
      <div className="flex flex-wrap gap-2">
        <select
          value={contentAssetId}
          onChange={(e) => setContentAssetId(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500"
        >
          <option value="">-- Chọn ảnh/video --</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.asset_code} ({asset.category ?? "?"}, {asset.file_type})
            </option>
          ))}
        </select>
        <select
          value={socialAccountId}
          onChange={(e) => setSocialAccountId(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.account_name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption sẽ đăng lên bài viết..."
        rows={2}
        className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-cyan-500"
      />
      <button
        type="submit"
        disabled={pending || !contentAssetId || !caption.trim() || !socialAccountId}
        className="self-start rounded-md bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Đang đăng..." : "Đăng ngay"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </form>
  );
}
