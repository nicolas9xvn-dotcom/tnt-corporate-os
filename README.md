# TNT AI Corporate Operating System — Phase 1

Next.js (App Router, TypeScript, Tailwind) + Supabase (Auth + Postgres) + Claude API,
deploy qua Vercel. Kiến trúc gốc: [`docs/tnt-corporate-os-kien-truc.md`](./docs/tnt-corporate-os-kien-truc.md).

## Trạng thái hiện tại

Đã có:
- Project Next.js khởi tạo (App Router, TypeScript, Tailwind v4).
- Migration SQL Phase 1 đầy đủ 10 bảng + RLS theo role (`chairman` / `ceo` / `staff`) —
  xem `supabase/migrations/`.
- Trang đăng nhập thật (Supabase Auth, email/mật khẩu) tại `/login`.
- CEO Command Center rút gọn tại `/dashboard`: Tập đoàn → Công ty con → Phòng ban → Agent,
  đọc dữ liệu thật từ Supabase (không có dữ liệu giả — nếu bảng rỗng thì hiển thị trạng thái
  rỗng, không bịa số liệu).

**TODO — chưa kết nối thật:**
- [ ] Chưa nối vào project Supabase thật (cần `NEXT_PUBLIC_SUPABASE_URL` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, xem mục "Kết nối Supabase" bên dưới).
- [ ] Chưa gọi Claude API ở đâu cả (chưa có route xử lý agent task) — Phase 1 chỉ có
      cấu trúc dữ liệu + hiển thị, phần "agent thực thi task qua Claude API" là bước kế tiếp.
- [ ] Chưa có UI tạo/sửa company/department/agent (chỉ đọc); thêm dữ liệu qua Supabase
      Table Editor hoặc SQL trong lúc chưa có UI quản trị.
- [ ] Chưa có UI gán role/business_unit_id cho user mới (mặc định mọi user mới là `staff`,
      không thuộc business unit nào — chairman phải tự sửa trong Supabase Table Editor).
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
