# TNT AI Corporate Operating System — Kiến trúc & Kế hoạch triển khai

> Sao chép lại từ file PDF kiến trúc gốc do người dùng cung cấp, để tham chiếu trong repo
> khi làm việc với Claude Code ở các phiên sau.

## 1. Đánh giá thực trạng

Bản demo hiện tại (React artifact trong Claude chat) đã làm được:

- Cấu trúc phân cấp Chủ tịch HĐQT → Công ty con → CEO → Phòng ban
- 15 nhân sự AI cho AME29, mỗi người có system prompt riêng
- Knowledge Base tạm (lưu trên trình duyệt của người dùng, không phải server thật)
- Báo cáo lên Tập đoàn, Phòng Họp HĐQT (mock, chưa có nhiều dữ liệu thật)

**Giới hạn thật của bản demo:** chạy trong 1 trình duyệt, không có database thật, không có
tài khoản đăng nhập, không chia sẻ dữ liệu giữa các thiết bị, không có audit log thật, không
phân quyền dữ liệu theo vai trò. Đây là lý do cần chuyển sang web app thật.

## 2. Tech stack đề xuất

| Lớp | Công nghệ | Lý do |
| --- | --- | --- |
| Frontend + Backend | Next.js (React) | 1 framework cho cả giao diện và API |
| Database + Auth + Storage | Supabase | Free tier, PostgreSQL + đăng nhập + lưu file |
| AI Agents | Claude API | Gọi trực tiếp từ backend Next.js |
| Deploy | Vercel | Kéo-thả từ GitHub, free tier đủ dùng giai đoạn đầu |

## 3. Database schema — Phase 1

```
organizations      (TNT Corporation — 1 dòng)
business_units      id, organization_id, name, status (active/coming_soon), ceo_title
departments          id, business_unit_id, name, code
agents                id, department_id, name, role, reports_to (agent_id), system_prompt, created_at
users                 id, email, role (chairman/ceo/staff), business_unit_id (nullable)
tasks                 id, agent_id, created_by, title, status, input, output, created_at
knowledge_entries    id, business_unit_id, department_id (nullable), text, created_by, created_at
reports               id, business_unit_id, text, created_by, created_at   -- báo cáo lên Tập đoàn
decisions             id, title, context, recommendation, decision, reason, created_at  -- Decision Log
audit_log             id, actor, action, target, input, output, created_at
```

Đủ cho Phase 1: đăng nhập thật, phân quyền theo `role`, Knowledge Base lưu server thật,
Task/Report/Decision Log thật — chưa cần KPI tự động (cần nối kế toán thật trước) hay Red
Team (thêm ở Phase 2).

Migration SQL thật nằm ở `supabase/migrations/0001_init_schema.sql` và
`supabase/migrations/0002_rls_policies.sql`.

## 4. Lộ trình theo Phase

- **Phase 1 (đang làm):** CEO Command Center rút gọn, cấu trúc Tập đoàn → Công ty con →
  Phòng ban → Agent, đăng nhập thật (Supabase Auth), Knowledge Base thật theo
  `business_unit_id`, Task log thật.
- **Phase 2:** Executive Board (CFO/COO/CMO agent), Red Team agent phản biện quyết định,
  Decision Log, Audit Log đầy đủ.
- **Phase 3:** Nối dữ liệu thật — Google Maps, ame29-accounting, ame29-nail-app để KPI
  không còn là số giả.
- **Phase 4:** Agent tự phối hợp, escalation tự động, automation qua n8n.

Không làm Network View (kéo-thả zoom/pan kiểu neural network) ở Phase 1 — để Phase 2-3 khi
có nhiều công ty con thật.
