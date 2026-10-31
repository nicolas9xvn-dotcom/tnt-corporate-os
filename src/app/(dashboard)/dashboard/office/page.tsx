// Văn phòng AI: mô phỏng isometric các tác vụ đã lên lịch (bản tin chứng khoán,
// BOX, họp tuần...). Trang tĩnh public/tnt-office.html vẫn đi qua proxy.ts nên
// cần đăng nhập như các trang dashboard khác. Dữ liệu là ảnh chụp lịch thật,
// chưa kết nối trực tiếp (trang tự ghi rõ "MÔ PHỎNG").
export default function OfficePage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="hud-eyebrow text-xs">Văn phòng AI</p>
          <p className="text-sm text-slate-400">
            Các nhân sự AI đang chạy theo lịch thật · mô phỏng, chưa kết nối trực tiếp
          </p>
        </div>
        <a
          href="/tnt-office.html"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-700 hover:text-cyan-300"
        >
          Mở toàn màn hình
        </a>
      </div>
      <iframe
        src="/tnt-office.html"
        title="TNT AI Office"
        className="h-[calc(100vh-11rem)] min-h-[640px] w-full rounded-lg border border-slate-800"
      />
    </div>
  );
}
