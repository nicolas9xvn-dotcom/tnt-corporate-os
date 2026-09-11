import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ReviewItem } from "./review-item";

const CATEGORY_LABELS: Record<string, string> = {
  NAIL: "NAIL",
  PARTS_CHARM: "PARTS & CHARM",
  SALON: "SALON",
  PROCESS: "PROCESS",
  PEOPLE: "PEOPLE",
  CUSTOMER: "CUSTOMER",
  BRAND_MOOD: "BRAND & MOOD",
};

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function ContentOsPage() {
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-amber-300">Chưa kết nối Supabase.</p>;
  }

  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <p className="text-sm text-slate-400">Bạn cần đăng nhập.</p>;

  const { data: viewer } = await supabase.from("users").select("role, business_unit_id").eq("id", user.id).maybeSingle();
  if (!viewer) return <p className="text-sm text-slate-400">Không tìm thấy hồ sơ người dùng.</p>;

  const { data: businessUnits } = await supabase.from("business_units").select("id, name, google_drive_root_folder_id").order("name");
  const targetBusinessUnitId = viewer.business_unit_id ?? businessUnits?.[0]?.id ?? null;
  if (!targetBusinessUnitId) {
    return <p className="text-sm text-amber-300">Chưa có công ty con nào trong database.</p>;
  }
  const targetUnit = businessUnits?.find((b) => b.id === targetBusinessUnitId);

  if (!targetUnit?.google_drive_root_folder_id) {
    return (
      <div className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Content OS</p>
        <h2 className="hud-title mt-1 text-xl font-bold text-white">Chưa kết nối Google Drive</h2>
        <p className="mt-2 max-w-xl text-sm text-slate-400">
          Công ty con này chưa có <code className="rounded bg-black/30 px-1">google_drive_root_folder_id</code> —
          điền Folder ID của thư mục &quot;AME29 PHOTO LIBRARY&quot; vào bảng{" "}
          <code className="rounded bg-black/30 px-1">business_units</code> qua Supabase Table Editor, và cấu hình
          <code className="rounded bg-black/30 px-1"> GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY</code> trên Vercel — xem README.
        </p>
      </div>
    );
  }

  const [todayRes, reviewRes, unusedCountRes, nailSetsCountRes, libraryRes] = await Promise.all([
    supabase
      .from("content_assets")
      .select("id, status", { count: "exact" })
      .eq("business_unit_id", targetBusinessUnitId)
      .gte("created_at", startOfToday()),
    supabase
      .from("content_assets")
      .select("id, original_filename, file_type, drive_file_id, review_reason, confidence")
      .eq("business_unit_id", targetBusinessUnitId)
      .eq("status", "REVIEW")
      .order("created_at", { ascending: true })
      .limit(30),
    supabase
      .from("content_assets")
      .select("id", { count: "exact", head: true })
      .eq("business_unit_id", targetBusinessUnitId)
      .eq("status", "UNUSED"),
    supabase.from("nail_sets").select("id", { count: "exact", head: true }).eq("business_unit_id", targetBusinessUnitId),
    supabase
      .from("content_assets")
      .select("id, asset_code, category, original_filename, drive_file_id, status")
      .eq("business_unit_id", targetBusinessUnitId)
      .neq("status", "REVIEW")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const todayItems = todayRes.data ?? [];
  const newToday = todayRes.count ?? todayItems.length;
  const autoClassifiedToday = todayItems.filter((i) => i.status !== "REVIEW").length;
  const reviewItems = reviewRes.data ?? [];
  const unusedCount = unusedCountRes.count ?? 0;
  const nailSetsCount = nailSetsCountRes.count ?? 0;
  const library = libraryRes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">AME29 Content OS</p>
        <h2 className="hud-title hud-glow-text mt-1 text-2xl font-bold text-white">Hôm nay</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Nhân viên chỉ cần upload ảnh/video thô vào thư mục &quot;00 INBOX&quot; trên Google Drive — AI tự đọc, tự
          phân loại, tự dời vào đúng thư mục, không cần đổi tên hay chọn folder. Kết quả không chắc chắn sẽ nằm ở mục
          &quot;Cần duyệt&quot; bên dưới.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Asset mới hôm nay", value: newToday },
            { label: "Tự phân loại", value: autoClassifiedToday },
            { label: "Cần duyệt", value: reviewItems.length },
            { label: "Nail Set", value: nailSetsCount },
            { label: "Chưa dùng", value: unusedCount },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-center">
              <p className="text-2xl font-bold text-cyan-300">{stat.value}</p>
              <p className="mt-1 text-[0.65rem] text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Cần duyệt ({reviewItems.length})</p>
        <p className="mt-1 text-xs text-slate-500">
          AI không đủ chắc chắn — bấm đúng nhóm cho từng file. AI sẽ ghi nhớ để tránh lặp lại lỗi tương tự.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {reviewItems.length === 0 && <p className="text-sm text-slate-500">Không có gì cần duyệt.</p>}
          {reviewItems.map((item) => (
            <ReviewItem
              key={item.id}
              id={item.id}
              filename={item.original_filename}
              fileType={item.file_type}
              driveFileId={item.drive_file_id}
              reviewReason={item.review_reason}
              confidence={item.confidence}
            />
          ))}
        </div>
      </section>

      <section className="hud-panel rounded-lg p-6">
        <p className="hud-eyebrow text-xs">Thư viện gần đây ({library.length})</p>
        {library.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có asset nào đã phân loại.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {library.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
              >
                <a
                  href={`https://drive.google.com/file/d/${item.drive_file_id}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-cyan-300 underline"
                >
                  {item.asset_code} — {item.original_filename}
                </a>
                <span className="shrink-0 rounded-full border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400">
                  {CATEGORY_LABELS[item.category ?? ""] ?? item.category} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
