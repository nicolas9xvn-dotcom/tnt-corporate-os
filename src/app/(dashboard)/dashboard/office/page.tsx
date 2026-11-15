// Văn phòng AI: văn phòng isometric chạy bằng dữ liệu thật (agent, trạng thái,
// việc, phê duyệt) lấy từ /api/office/state. Trang tĩnh public/tnt-office-live.html
// vẫn đi qua proxy.ts nên cần đăng nhập như các trang dashboard khác. Bản mô
// phỏng cũ (lịch tác vụ Claude, chụp ngày 30/10) còn ở public/tnt-office.html.
export default function OfficePage() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="hud-eyebrow text-xs">Văn phòng AI</p>
          <p className="text-sm text-slate-400">
            Nhân sự AI làm việc theo thời gian thực · dữ liệu lấy trực tiếp từ hệ thống
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/tnt-office.html"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-400 transition hover:border-cyan-700 hover:text-cyan-300"
          >
            Bản mô phỏng cũ
          </a>
          <a
            href="/tnt-office-live.html"
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-700 hover:text-cyan-300"
          >
            Mở toàn màn hình
          </a>
        </div>
      </div>
      <iframe
        src="/tnt-office-live.html"
        title="TNT AI Office"
        className="h-[calc(100vh-11rem)] min-h-[640px] w-full rounded-lg border border-slate-800"
      />
    </div>
  );
}
