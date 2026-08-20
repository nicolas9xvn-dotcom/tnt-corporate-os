# TNT AI Corporate Operating System — Phase 1

Next.js (App Router, TypeScript, Tailwind) + Supabase (Auth + Postgres) + Claude API,
deploy qua Vercel. Kiến trúc gốc: [`docs/tnt-corporate-os-kien-truc.md`](./docs/tnt-corporate-os-kien-truc.md).

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
  AME29 thật (6 phòng ban, 19 agent — 15 có system prompt thật do founder cung cấp, 4 role
  quản lý trung gian còn thiếu prompt). **Chưa chạy trên Supabase thật** — xem hướng dẫn
  "Kết nối Supabase" bên dưới, chạy nối tiếp theo đúng số thứ tự file.

**TODO — chưa kết nối thật:**
- [ ] Chưa gọi Claude API ở đâu cả (chưa có route xử lý agent task) — Phase 1 chỉ có
      cấu trúc dữ liệu + hiển thị, phần "agent thực thi task qua Claude API" là bước kế tiếp.
      Trường `system_prompt` đã lưu được nhưng chưa dùng để gọi model.
- [ ] Chưa có UI sửa/xoá company/department/agent (mới có tạo mới); sửa/xoá qua Supabase
      Table Editor trong lúc chưa có UI quản trị đầy đủ.
- [ ] Chưa có UI gán role/business_unit_id cho user mới (mặc định mọi user mới là `staff`,
      không thuộc business unit nào — chairman phải tự sửa trong Supabase Table Editor).
- [ ] **CEO Command Center chưa hiển thị agent cấp `executive`** (agent không thuộc
      phòng ban nào, ví dụ CEO AME29) — cây hiện tại chỉ nhóm agent theo department, nên
      executive sẽ "vô hình" trên UI dù đã có thật trong DB. Cần vẽ lại tree để có 1 tầng
      riêng cho executive trước department, và hiển thị chuỗi `reports_to` thay vì liệt kê
      agent phẳng trong từng phòng ban.
- [ ] 4 role quản lý mới (Finance Manager, Admin & Legal Manager, Marketing Director,
      Brand & Design Manager) được tạo làm tầng trung gian nhưng **chưa có system prompt**
      — founder cung cấp sau, hiện để `NULL`.
- [ ] `status/approval_level/responsibilities/tools/kpi/escalation_note` đã có cột trong
      schema nhưng chưa điền giá trị thật cho từng agent (trừ `status` mặc định `idle`) —
      cần founder quyết định approval_level/KPI cho từng agent, không tự suy đoán.
- [ ] Chưa có bảng `workflows`/`approvals` — Google Review workflow và cơ chế approval
      1/2/3 mới dừng ở thiết kế, chưa có schema thật (xem migration tiếp theo).
- [ ] Knowledge Base / Task / Report / Decision Log: bảng + RLS đã có, nhưng chưa có
      màn hình để tạo/xem — chỉ mới có ở tầng database.
- [ ] Phase 2 trở đi (Executive Board, Red Team, Audit Log UI, Network View, tích hợp
      Google Maps / kế toán / n8n): chưa làm.

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
