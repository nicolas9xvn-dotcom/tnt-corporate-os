# TNT AI Corporate Operating System — Phase 1

Next.js (App Router, TypeScript, Tailwind) + Supabase (Auth + Postgres) + Gemini API,
deploy qua Vercel. Kiến trúc gốc: [`docs/tnt-corporate-os-kien-truc.md`](./docs/tnt-corporate-os-kien-truc.md)
đề xuất Claude API — đổi sang Gemini (`gemini-3.6-flash`) vì có gói miễn phí, xem "Kết nối
Gemini API" bên dưới.

## Trạng thái hiện tại

Đã có:
- Project Next.js khởi tạo (App Router, TypeScript, Tailwind v4).
- Migration SQL Phase 1 đầy đủ 10 bảng + RLS theo role (`chairman` / `ceo` / `staff`) —
  xem `supabase/migrations/`.
- Đã nối một project Supabase thật, deploy live trên Vercel (`tnt-corporate-os.vercel.app`).
- Trang đăng nhập thật (Supabase Auth, email/mật khẩu) tại `/login`.
- CEO Command Center rút gọn tại `/dashboard`: Tập đoàn → Công ty con → Phòng ban → Agent,
  đọc dữ liệu thật từ Supabase (không có dữ liệu giả — nếu bảng rỗng thì hiển thị trạng thái
  rỗng, không bịa số liệu).
- Form tạo công ty con / phòng ban / agent ngay trong `/dashboard` (server actions trong
  `src/lib/actions/command-center.ts`), ẩn/hiện theo quyền: chairman tạo được công ty con ở
  bất kỳ đâu; ceo chỉ tạo phòng ban/agent trong đúng công ty con của mình (RLS chặn ở tầng DB
  nếu ai đó cố lách qua UI).
- `supabase/migrations/0003_agent_hierarchy.sql` + `0004_seed_ame29_agents.sql`: thêm tầng
  Executive vào bảng `agents` (`level`, `status`, `approval_level`, `responsibilities`,
  `tools`, `kpi`, `escalation_note`, `business_unit_id` trực tiếp) và seed đúng cấu trúc
  AME29 thật (6 phòng ban, 19 agent). `supabase/migrations/0007_manager_prompts.sql`: bổ
  sung system prompt thật cho 4 role quản lý trung gian còn thiếu (Finance Manager,
  Admin & Legal Manager, Marketing Director, Brand & Design Manager) — **cả 19/19 agent
  AME29 giờ đã có system prompt thật**, không agent nào còn để trống.
- CEO Command Center giờ vẽ đúng sơ đồ tổ chức (`network-view.tsx`, dùng `@xyflow/react`):
  agent cấp `executive` (không thuộc phòng ban) đứng giữa, các agent khác toả ra theo đúng
  chuỗi `reports_to`, không còn liệt kê phẳng theo phòng ban.
- **Agent chạy được task thật qua Gemini API** (`src/lib/actions/run-task.ts`): bấm vào 1
  agent trong sơ đồ → panel chi tiết có ô "Giao việc" → gọi `gemini-3.6-flash` với đúng
  `system_prompt` của agent đó → lưu kết quả thật vào bảng `tasks` + `audit_log`. Chỉ hoạt
  động với agent đã có `system_prompt` (19/19 agent AME29, sau khi chạy migration `0007`
  — trước đó agent chưa có prompt sẽ báo lỗi rõ ràng thay vì tự bịa prompt để chạy).
  **Đã test thật trên production, hoạt động.**
  `GEMINI_API_KEY` đã cấu hình trên Vercel (free tier — key phải thuộc 1 project Google Cloud
  ở trạng thái "active"/còn free trial, không phải project cũ đã hết prepayment credits).
- **Cơ chế duyệt (`approval_level`) đã xây xong và đã gán cho AME29**
  (`src/lib/actions/approvals.ts`, `approvals-inbox.tsx`,
  `supabase/migrations/0005_task_approval_status.sql`,
  `supabase/migrations/0006_approval_levels_ame29.sql`): agent có `approval_level >= 2` khi
  được giao việc sẽ tạo task ở trạng thái `approval_required` thay vì chạy ngay — task xuất
  hiện trong mục "Chờ duyệt" ở đầu `/dashboard`. Level 2: chairman hoặc đúng ceo của business
  unit đó mới duyệt/từ chối được; Level 3: chỉ chairman. Duyệt → gọi Gemini thật và lưu kết
  quả; Từ chối → đánh dấu `rejected`, không gọi Gemini. Founder đã quyết định (2026-08-20):
  Level 2 — Content Director, Chiến lược Giá & Dịch vụ, Luật sư Thuế, Cố vấn Hành chính -
  Pháp lý; Level 3 — CEO AME29; các agent còn lại để `NULL` (tự chạy).
  **Cần chạy `supabase/migrations/0005_task_approval_status.sql` rồi
  `supabase/migrations/0006_approval_levels_ame29.sql` trên Supabase (SQL Editor) để có hiệu
  lực** — 0005 thêm trạng thái `approval_required`/`rejected` vào constraint của bảng `tasks`,
  0006 gán các approval_level ở trên.
- [x] ~~Chưa gate theo `approval_level`~~ (đã xây và đã gán cho AME29 — xem trên).
- **Ô "Giao việc" nhận được cả link website và file đính kèm, cho mọi agent kể cả agent
  cần duyệt** (`src/lib/gemini.ts`, `run-task.ts`, `approvals.ts`, `run-task-form.tsx`,
  `src/lib/attachments.ts`, `supabase/migrations/0008_task_attachments.sql`,
  `0010_task_draft_cleanup.sql`): dán link vào ô nội dung → Gemini tự đọc nội dung trang đó
  (tool `url_context` có sẵn của Gemini). Đính kèm được ảnh/PDF/txt/csv, **tối đa 5 file, mỗi
  file ≤ 20MB**. File được trình duyệt upload thẳng lên Supabase Storage (bucket riêng
  `task-attachments`, private, RLS theo đúng business unit) — không đi qua server Next.js
  nên không bị giới hạn dung lượng request của Vercel (~4.5MB cho Server Actions). Với agent
  tự chạy ngay, server tải file từ Storage về, gửi cho Gemini, xong thì xoá khỏi Storage
  ngay. Với agent cần duyệt (`approval_level >= 2`), file giữ nguyên trong Storage tới khi
  có người duyệt, lúc đó mới tải về gửi Gemini rồi xoá. **Cần chạy 2 migration
  `0008_task_attachments.sql` và `0010_task_draft_cleanup.sql`** trên Supabase (SQL Editor)
  trước khi dùng. Nếu Supabase báo lỗi upload vượt hạn mức, hạn mức bucket có thể chỉnh ở
  Supabase Dashboard → Storage → `task-attachments` → Settings (đã đặt sẵn 20MB/file qua
  migration, khớp với giới hạn phía client).
- **Giao diện "màn hình LED cảm ứng" + trạng thái hoạt động thật** (`src/lib/sound.ts`,
  `src/components/sound-effects.tsx`, `network-view.tsx`, `globals.css`,
  `supabase/migrations/0009_agent_status_realtime.sql`):
  - Âm thanh chạm màn hình đổi sang file thật do founder cung cấp
    (`public/sounds/hud-click.mp3`), phát mỗi khi bấm nút/link ở bất kỳ đâu trong app, kèm
    hiệu ứng gợn sóng neon (ripple) tại đúng điểm chạm.
  - Panel chi tiết agent (`AgentDetailPanel`) có hiệu ứng quét ngang kiểu màn hình LED
    (`.hud-scan`).
  - **Agent nào đang thật sự xử lý task sẽ nhấp nháy neon** (viền cyan pulsing) và **dây nối
    lên cấp trên sáng lên, chạy nhanh như dòng điện** — trạng thái này lấy thật từ cột
    `agents.status` qua Supabase Realtime (không phải hiệu ứng dựng sẵn): `run-task.ts` và
    `approvals.ts` set `status = 'running'` đúng lúc gọi Gemini thật, set lại `idle`/`error`
    khi xong, và mọi phiên đang mở `/dashboard` (kể cả người khác) thấy thay đổi ngay lập
    tức. **Giới hạn thật cần biết:** đây là trạng thái "agent đang xử lý task", không phải
    "file đang được chuyển giao giữa các phòng ban" — hệ thống hiện chưa có cơ chế agent tự
    động chuyển việc cho agent khác (routing/workflow thật), nên dây nối sáng lên phản ánh
    hoạt động thật của agent đó, không phải một lần chuyển file thật giữa 2 bộ phận. **Cần
    chạy `supabase/migrations/0009_agent_status_realtime.sql`** trên Supabase (SQL Editor)
    để bật Realtime cho bảng `agents` + tạo hàm `set_agent_status`.
- **Agent nhớ lại các lần giao việc trước** (`src/lib/actions/agent-history.ts`,
  `gemini.ts`, `run-task.ts`, `approvals.ts`): mỗi lần giao việc, hệ thống lấy 8 task gần
  nhất đã xong của đúng agent đó (nội dung giao + kết quả agent trả lời) và gửi lại cho
  Gemini như lịch sử hội thoại, trước khi gửi yêu cầu mới. Nhờ vậy có thể chia một việc lớn
  (VD: tổng hợp báo cáo 9 tháng) ra nhiều lần gửi — lần sau agent vẫn nhớ nội dung + kết quả
  các lần trước, không phải giải thích lại từ đầu. **Cách hoạt động thật, cần hiểu rõ:** đây
  là bộ nhớ dạng chữ (agent nhớ những gì nó đã đọc/kết luận), không phải file gốc được lưu
  vĩnh viễn — nếu task đã xong (không phải đang chờ duyệt), file đính kèm gốc không được giữ
  lại, chỉ có phần agent đã viết ra (thường là tóm tắt/trích số liệu từ file đó) được nhớ ở
  lần sau. Muốn chắc chắn số liệu không bị sót, nên yêu cầu agent liệt kê rõ số liệu trong
  câu trả lời từng lần thay vì chỉ nói "đã nhận file".
- Sửa lỗi cũ + tăng giới hạn file: bản trước cho chọn tối đa 3 file × 4MB nhưng giới hạn
  request thật của server chỉ 8MB (có thể còn thấp hơn do Vercel giới hạn cứng ~4.5MB cho
  Server Actions) — chọn đủ file lớn dễ báo lỗi gửi thất bại. Đổi hẳn sang cách upload thẳng
  lên Supabase Storage (xem mục "Giao việc" ở trên) để không còn bị giới hạn này — giờ 5 file
  × 20MB mỗi lần.

**TODO — chưa kết nối thật:**
- [ ] Chưa có cơ chế agent tự động chuyển việc/file cho agent khác (routing/workflow thật
      giữa các bộ phận) — hiện mỗi task chỉ chạy trong đúng 1 agent do người dùng chọn.
- [ ] Panel agent chưa hiện lại danh sách lịch sử task cũ để xem trực tiếp (agent đã "nhớ"
      khi trả lời, nhưng người dùng chưa xem lại được danh sách các lần giao việc trước đó
      ngay trên UI — phải xem qua Supabase Table Editor, bảng `tasks`).
- [ ] Task hiện chạy 1 lần, không có bộ nhớ hội thoại (mỗi lần giao việc là 1 lượt độc lập,
      không nhớ các lần giao việc trước) và panel chưa hiện lại lịch sử task cũ của agent.
- [ ] Chưa có UI sửa/xoá company/department/agent (mới có tạo mới); sửa/xoá qua Supabase
      Table Editor trong lúc chưa có UI quản trị đầy đủ.
- [ ] Chưa có UI gán role/business_unit_id cho user mới (mặc định mọi user mới là `staff`,
      không thuộc business unit nào — chairman phải tự sửa trong Supabase Table Editor).
- [x] ~~4 role quản lý mới chưa có system prompt~~ (đã điền — xem `0007_manager_prompts.sql`
      ở trên).
- [ ] `responsibilities/tools/kpi/escalation_note` đã có cột trong schema nhưng chưa điền
      giá trị thật cho từng agent — cần founder quyết định, không tự suy đoán. (`approval_level`
      đã điền cho AME29 — xem trên.)
- [ ] Chưa có bảng `workflows` riêng cho Google Review workflow (chỉ mới cơ chế approval
      1/2/3 chung, dùng `tasks.status` — xem trên).
- [ ] Knowledge Base / Report / Decision Log: bảng + RLS đã có, nhưng chưa có màn hình để
      tạo/xem — chỉ mới có ở tầng database (Task giờ đã hoạt động thật, xem trên).
- [ ] Phase 2 trở đi (Executive Board, Red Team, Audit Log UI, tích hợp Google Maps / kế
      toán / n8n): chưa làm.

## Kết nối Supabase

1. Tạo project tại [supabase.com](https://supabase.com), lấy **Project URL** và **anon key**
   (Project Settings → API).
2. Copy `.env.local.example` thành `.env.local` và điền hai giá trị trên.
3. Vào Supabase SQL Editor, chạy lần lượt (đúng thứ tự):
   - `supabase/migrations/0001_init_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
4. Tạo một dòng trong bảng `organizations` (ví dụ `name = 'TNT Corporation'`) — đây là dữ
   liệu thật của bạn, không phải seed giả, nên không có sẵn trong migration.
5. Tạo tài khoản đăng nhập đầu tiên qua Supabase Auth (Dashboard → Authentication → Users →
   Add user, hoặc bật self-signup). Trigger `handle_new_user` sẽ tự tạo dòng tương ứng trong
   bảng `users` với `role = 'staff'`. Sửa dòng đó thành `role = 'chairman'` (SQL Editor hoặc
   Table Editor) để có toàn quyền trên Command Center.
6. Thêm `business_units` / `departments` / `agents` qua Table Editor hoặc SQL — chưa có UI
   quản trị ở Phase 1 (xem TODO).

## Kết nối Gemini API

Để nút "Giao việc" trong CEO Command Center hoạt động thật (miễn phí):

1. Vào [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → đăng nhập bằng
   tài khoản Google → **Create API key**. Không cần thẻ tín dụng cho gói free tier.
2. **Không dán key vào chat** — thêm trực tiếp vào Environment Variables trên Vercel (Project
   Settings → Environment Variables): tên biến `GEMINI_API_KEY`, giá trị là key vừa tạo.
3. Redeploy lại project trên Vercel để biến môi trường mới có hiệu lực.
4. Nếu muốn chạy local, thêm dòng `GEMINI_API_KEY=...` vào `.env.local` (đã có sẵn trong
   `.env.local.example`, file này không bị commit).

Gói free tier có giới hạn số lượt gọi/phút — đủ dùng để test AME29, nếu sau này cần dùng
nhiều/ổn định hơn thì nâng cấp qua Google Cloud billing (vẫn cùng 1 API key, không cần sửa code).

## Chạy local

```bash
npm install
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000). Nếu chưa điền `.env.local`, `/login` và
`/dashboard` sẽ hiển thị banner "chưa kết nối Supabase" thay vì crash hoặc hiện dữ liệu giả.

## Cấu trúc thư mục liên quan

```
src/app/login/                    Trang đăng nhập
src/app/(dashboard)/              Route group yêu cầu đăng nhập
src/app/(dashboard)/dashboard/    CEO Command Center (cây Tập đoàn → Công ty con → Agent)
src/lib/supabase/                 Supabase client (browser + server) + kiểm tra env
src/lib/actions/auth.ts           Server action đăng xuất
src/proxy.ts                      Refresh session + chặn route chưa đăng nhập (Next.js 16
                                   đổi tên middleware.ts → proxy.ts)
supabase/migrations/              SQL schema + RLS Phase 1
docs/tnt-corporate-os-kien-truc.md Tài liệu kiến trúc gốc
```

## Deploy lên Vercel

Kéo repo vào [Vercel](https://vercel.com/new), chọn thư mục `tnt-corporate-os` làm Root
Directory nếu repo có nhiều project, điền `NEXT_PUBLIC_SUPABASE_URL` và
`NEXT_PUBLIC_SUPABASE_ANON_KEY` trong Environment Variables.
