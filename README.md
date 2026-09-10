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
  `gemini.ts`, `run-task.ts`, `approvals.ts`): mỗi lần giao việc, hệ thống lấy 20 task gần
  nhất đã xong của đúng agent đó (nội dung giao + kết quả agent trả lời, mỗi phần cắt bớt
  nếu quá 6000 ký tự để tránh 1 task quá dài chiếm hết ngữ cảnh) và gửi lại cho Gemini như
  lịch sử hội thoại, trước khi gửi yêu cầu mới. Nhờ vậy có thể chia một việc lớn (VD: tổng
  hợp báo cáo 9 tháng) ra nhiều lần gửi — lần sau agent vẫn nhớ nội dung + kết quả các lần
  trước, không phải giải thích lại từ đầu. Con số 20 là lựa chọn cân bằng chi phí/tốc độ,
  không phải giới hạn kỹ thuật — có thể tăng thêm nếu 20 lần chưa đủ (đổi `HISTORY_LIMIT`
  trong `agent-history.ts`); nếu cần "nhớ mọi thứ mãi mãi + tự tìm đúng đoạn liên quan" như
  ChatGPT thật sự thì cần xây thêm tìm kiếm ngữ nghĩa (embeddings) — việc lớn hơn, chưa làm.
  **Cách hoạt động thật, cần hiểu rõ:** đây là bộ nhớ dạng chữ (agent nhớ những gì nó đã
  đọc/kết luận), không phải file gốc được lưu vĩnh viễn — nếu task đã xong (không phải đang
  chờ duyệt), file đính kèm gốc không được giữ
  lại, chỉ có phần agent đã viết ra (thường là tóm tắt/trích số liệu từ file đó) được nhớ ở
  lần sau. Muốn chắc chắn số liệu không bị sót, nên yêu cầu agent liệt kê rõ số liệu trong
  câu trả lời từng lần thay vì chỉ nói "đã nhận file".
- Sửa lỗi cũ + tăng giới hạn file: bản trước cho chọn tối đa 3 file × 4MB nhưng giới hạn
  request thật của server chỉ 8MB (có thể còn thấp hơn do Vercel giới hạn cứng ~4.5MB cho
  Server Actions) — chọn đủ file lớn dễ báo lỗi gửi thất bại. Đổi hẳn sang cách upload thẳng
  lên Supabase Storage (xem mục "Giao việc" ở trên) để không còn bị giới hạn này — giờ 5 file
  × 20MB mỗi lần.
- **Agent tự giao lại việc cho đúng cấp dưới (delegation thật, không phải hiệu ứng)**
  (`src/lib/actions/agent-runner.ts`, `run-task.ts`, `approvals.ts`,
  `supabase/migrations/0011_task_delegation.sql`): khi giao việc cho 1 agent có cấp dưới
  (VD: CEO AME29), Gemini có thêm 1 công cụ tên `delegate_to_agent` — chỉ gọi được tới đúng
  những agent là cấp dưới trực tiếp thật của agent đó (lấy từ `reports_to` thật, Gemini
  không tự bịa tên agent). Khi Gemini gọi công cụ này, hệ thống tạo 1 task **thật** cho agent
  cấp dưới, chạy bằng đúng system prompt + trí nhớ riêng của agent đó, rồi trả kết quả về —
  agent cấp trên đọc kết quả và viết câu trả lời cuối cùng (có thể tổng hợp từ nhiều agent).
  Agent cấp dưới nhận việc, nếu bản thân nó cũng có cấp dưới, lại tiếp tục giao được nữa —
  chuỗi giao việc đi tới tận specialist nếu cần. Kết quả từng agent được giao lại hiện ra
  trong ô "Đã giao lại cho" ngay dưới kết quả chính, và mỗi lần giao lại là **1 dòng thật**
  trong bảng `tasks` (có `parent_task_id` trỏ về task gốc) — không giấu, không tóm tắt giả.
  **Giới hạn cố ý đặt ra, cần hiểu rõ trước khi dùng nhiều:**
  - Tối đa 4 tầng giao việc (khớp với 4 cấp: executive → director → manager → specialist)
    và tối đa 6 lượt giao việc/1 lần bấm "Gửi" (`MAX_DELEGATION_DEPTH`,
    `MAX_DELEGATIONS_PER_REQUEST` trong `agent-runner.ts`) — không phải giới hạn kỹ thuật,
    mà để tránh 1 lần giao việc gọi Gemini quá nhiều lần (**mỗi lượt giao lại là 1-2 lần gọi
    Gemini thật** — dây chuyền càng dài/rộng càng tốn quota, dễ chạm giới hạn free tier
    nhanh hơn so với giao việc trực tiếp cho 1 agent).
  - Agent nào có khả năng giao việc lại (có cấp dưới) sẽ **tạm thời không đọc được link
    website** ở lượt giao việc đó — API Gemini không cho dùng đồng thời công cụ tự chọn
    (`delegate_to_agent`) và công cụ đọc trang web (`url_context`) trong cùng 1 lần gọi.
    Agent không có cấp dưới (specialist) vẫn đọc link bình thường như trước.
  - **Cần chạy `supabase/migrations/0011_task_delegation.sql`** trên Supabase (SQL Editor)
    trước khi dùng.
  - Đây là tính năng mới, dùng function calling nhiều vòng của Gemini — chưa test được thật
    trên production (sandbox này không gọi được ra ngoài internet để test trực tiếp). Bạn
    thử với 1 việc đơn giản giao cho CEO AME29 trước, nếu gặp lỗi gửi lại nguyên văn để tôi
    sửa.
- **Model dự phòng khi Gemini hết quota miễn phí trong ngày** (`src/lib/actions/text-fallback.ts`,
  `agent-runner.ts`): agent **không có cấp dưới** (specialist — TikTok Agent, Kế toán, Luật
  sư Thuế...) sẽ tự động thử DeepSeek → Grok → OpenAI theo thứ tự đó nếu Gemini báo lỗi hết
  quota (429). Chỉ thử model dự phòng khi đúng là lỗi hết quota — lỗi khác (prompt sai, bug
  thật) vẫn báo lỗi bình thường, không âm thầm chuyển sang model khác. Agent **có cấp dưới**
  (CEO, các Manager...) chưa có dự phòng — tính năng giao việc lại chỉ code cho Gemini, xem
  mục trên.
  - **Cần tài khoản + API key riêng cho từng model** (không dùng chung với `GEMINI_API_KEY`),
    đều **mất phí thật**: DeepSeek tại platform.deepseek.com, Grok (xAI) tại console.x.ai,
    OpenAI tại platform.openai.com. Thêm vào Vercel Environment Variables:
    `DEEPSEEK_API_KEY`, `GROK_API_KEY`, `OPENAI_API_KEY` — thiếu cái nào thì bỏ qua cái đó,
    không lỗi gì cả (mặc định vẫn chạy Gemini-only như trước nếu không thêm gì thêm).
  - **Tên model trong code là phỏng đoán, chưa xác minh được thật** (`deepseek-chat`,
    `grok-4`, `gpt-4o-mini`) — y hệt tình huống từng gặp với Gemini (`gemini-2.5-flash` bị
    ngừng, phải đổi sang `gemini-3.6-flash`) vì các hãng hay đổi tên/ra bản mới, và sandbox
    này không gọi ra ngoài để kiểm tra tên mới nhất được. Nếu 1 model báo lỗi "not found" hay
    tương tự, sửa qua biến môi trường `DEEPSEEK_MODEL` / `GROK_MODEL` / `OPENAI_MODEL` (không
    cần sửa code) — đúng tên lấy từ trang tài liệu/dashboard hiện tại của hãng đó.
  - File đính kèm: DeepSeek không đọc được file nào (chỉ nhận chữ); Grok/OpenAI đọc được
    ảnh, không đọc được PDF/txt/csv khi chạy qua model dự phòng (chỉ Gemini đọc được đủ loại
    file như thiết kế ban đầu).
  - Không cần migration SQL nào cho phần này — chỉ cần thêm biến môi trường.
- **Quy tắc cố định (house rules) — chuẩn mực xuyên suốt, không tự đổi**
  (`src/lib/actions/house-rules.ts`, `house-rule-form.tsx`, `agent-runner.ts`,
  `supabase/migrations/0012_agent_house_rules.sql`): chairman/ceo mở panel 1 agent → mục
  "Quy tắc cố định" → nhập hướng dẫn + (tuỳ chọn) ảnh mẫu, VD "luôn viết caption theo phong
  cách ảnh này" → Gemini viết lại thành 1 quy tắc rõ ràng, cụ thể, lưu vào cột
  `agents.house_rules`. Từ đó, **mọi lần giao việc sau này cho agent đó đều tự động kèm quy
  tắc này** (gắn thẳng vào system prompt mỗi lần gọi Gemini) — khác với trí nhớ 20 lần gần
  nhất (có thể bị đẩy trôi theo thời gian), quy tắc cố định **không bao giờ tự mất** cho tới
  khi chairman/ceo chủ động xoá hoặc đặt lại.
  - **Tích "Áp dụng cho tất cả agent cấp dưới"** để lan quy tắc xuống toàn bộ nhóm (không chỉ
    cấp dưới trực tiếp — xuống tới tận specialist): VD đưa 1 ảnh mẫu nail cho Content
    Director, tích ô này → TikTok/Facebook/Instagram Agent (toàn bộ cấp dưới của Content
    Director) đều nhận đúng quy tắc đó luôn, không cần lặp lại từng agent.
  - **Cách hoạt động thật, cần hiểu rõ:** quy tắc lưu lại là **bản mô tả bằng chữ** do Gemini
    viết ra từ ảnh/hướng dẫn — không phải giữ nguyên ảnh gốc để dùng lại mãi mãi. Nếu đổi mẫu
    ảnh sau này, cần đặt lại quy tắc (ảnh mới) — quy tắc cũ không tự cập nhật theo ảnh mới.
  - Chỉ chairman/ceo của đúng công ty con mới thấy và đặt được quy tắc (dùng chung RLS với
    quyền sửa agent — `agents_write`) — staff không thấy mục này.
  - **Cần chạy `supabase/migrations/0012_agent_house_rules.sql`** trên Supabase (SQL Editor)
    trước khi dùng.
- **Tạo ảnh thật miễn phí cho agent Đồ họa & Thương hiệu MỀU**
  (`src/lib/actions/agent-runner.ts` — `generateAgentImage`,
  `supabase/migrations/0013_image_generation.sql`): agent này giờ khi được giao việc (kèm
  ảnh nail mẫu) sẽ **tạo ra 1 ảnh thật mới** theo đúng phong cách ảnh mẫu, dùng model tạo
  ảnh riêng của Gemini (`gemini-2.5-flash-image`) — **dùng chung `GEMINI_API_KEY` đã có, free
  tier, không cần tài khoản/API key trả phí mới**. Ảnh tạo ra hiện ngay trong ô "Kết quả" và
  cũng được lưu lại trong Storage (`task-attachments`, path `{task_id}/generated.png`) để có
  lịch sử. Chỉ agent này có khả năng này (bật qua cột `agents.image_generation`, hiện chưa có
  UI bật/tắt — chỉnh qua Supabase Table Editor nếu muốn bật cho agent khác).
  - **Giới hạn thật, đã giải thích với founder:** AI tạo ảnh không đáng tin cậy để vẽ CHỮ
    (banner khuyến mãi, địa chỉ, tiếng Nhật...) — chỉ dùng để tạo ảnh nail mới theo đúng
    tông màu/phong cách, không dùng để tự động ra 1 tấm poster marketing hoàn chỉnh có chữ.
  - **Tên model chưa xác minh được thật** (`gemini-2.5-flash-image`) — y hệt tình huống với
    Gemini text/DeepSeek/Grok/OpenAI ở trên. Nếu báo lỗi "không trả về ảnh nào", đổi qua biến
    môi trường `GEMINI_IMAGE_MODEL` (xem tên đúng tại aistudio.google.com hoặc docs Gemini API
    hiện tại).
  - Gói free tier của Gemini cho tạo ảnh có thể giới hạn số lượt/ngày chặt hơn so với chữ —
    chưa kiểm tra được con số chính xác (sandbox không gọi ra ngoài để test), nhưng nhu cầu
    2-3 ảnh/ngày của founder nhiều khả năng nằm trong hạn mức free.
  - **Cần chạy `supabase/migrations/0013_image_generation.sql`** trên Supabase (SQL Editor)
    trước khi dùng.
- **Nối vào Firebase thật của app AME29 Nail (lịch hẹn + doanh thu thật)**
  (`src/lib/firebase-admin.ts`, `src/lib/firebase-tools.ts`,
  `supabase/migrations/0014_firebase_tools.sql`): app đặt lịch/POS riêng của salon
  (`ame29-nail.netlify.app`, Firebase project `ame29-nail`) là nguồn dữ liệu thật —
  không phải Supabase của hệ thống này. Hai công cụ mới, đọc **chỉ đọc** (không bao giờ
  ghi), gắn cho đúng 2 agent:
  - **CEO AME29** (`can_read_schedule`): công cụ `get_schedule_gaps` — đọc `bookings/{ngày}`
    thật, tự tính (bằng code, không phải AI đoán) khung giờ trống thật của từng nhân viên
    trong ngày, dựa trên giờ mở cửa 10:00–22:00 lấy từ chính flyer marketing của AME29. Theo
    đúng luồng founder chọn: CEO đọc lịch trống → tự giao lại (`delegate_to_agent`, cơ chế
    có sẵn) cho **Chiến lược Giá & Dịch vụ** (cấp dưới trực tiếp của CEO) → agent đó đề xuất
    chương trình giảm giá cho khung giờ trống → đề xuất này nằm trong câu trả lời cuối CEO
    gửi lại cho founder. **Không tự động bật giảm giá** — founder tự quyết định có áp dụng
    hay không, hệ thống chỉ đọc + đề xuất.
  - **Kế toán** (`can_read_revenue`): công cụ `get_revenue_report` — đọc `shop/data.history`
    thật, tự tính (bằng code) tổng doanh thu/số lượt theo nhân viên/dịch vụ/nguồn khách
    trong 1 khoảng ngày cụ thể.
  - **Bảo mật, cần đọc kỹ:** kết nối này dùng Firebase **Service Account key** — key này về
    mặt kỹ thuật đọc/ghi được TOÀN BỘ dữ liệu Firebase, không bị chặn bởi Firestore Rules.
    **Không bao giờ dán key này vào chat** — thêm thẳng vào Vercel Environment Variables,
    biến `FIREBASE_SERVICE_ACCOUNT_KEY` (giá trị là toàn bộ nội dung file `.json` tải từ
    Firebase Console → Project settings → Service accounts). Code trong
    `firebase-admin.ts` tự kỷ luật chỉ gọi `.get()`, không bao giờ gọi
    `.set()/.update()/.delete()/.add()` — nhưng đây là kỷ luật ở tầng code, không phải giới
    hạn quyền thật của key. Muốn Google chặn cứng ở tầng quyền, tạo 1 service account riêng
    chỉ có role "Cloud Datastore Viewer" trong Google Cloud IAM thay vì dùng key mặc định.
  - Giờ mở cửa (10:00–22:00) đang hard-code trong `firebase-tools.ts` vì app Firebase không
    lưu sẵn — sửa trực tiếp trong code nếu giờ mở cửa thay đổi.
  - **Cần chạy `supabase/migrations/0014_firebase_tools.sql`** trên Supabase (SQL Editor)
    trước khi dùng — không đụng gì tới Firebase, chỉ thêm 2 cột đánh dấu agent nào được dùng
    công cụ nào.
- **Dữ liệu đối thủ & giá — live, sửa xong thấy ngay, Google Maps tự cập nhật**
  (`src/lib/competitor-tools.ts`, `src/lib/google-places.ts`,
  `src/app/(dashboard)/dashboard/competitors/`,
  `supabase/migrations/0015_competitor_intel.sql` → `0017_competitor_live_seed.sql`):
  ban đầu (migration 0015) đây là ảnh chụp tĩnh đóng gói trong code — sửa gì phải chạy lại
  script trích xuất rồi deploy lại. Từ migration 0016/0017, dữ liệu (233 tiệm nail Nhật Bản,
  gốc từ Google Maps/Hotpepper/Instagram/TikTok/Minimo do founder khảo sát tay, cộng dữ liệu
  cạnh tranh từ file dashboard HTML `AME29dashboard.html`) sống trong các bảng Supabase thật
  (`competitors`, `competitor_platform_stats`, `competitor_scorecard`, `competitor_actions`,
  `competitor_price_benchmark`, `competitor_city_rollup`) — trang
  **`/dashboard/competitors`** (link "Dữ liệu đối thủ" trên header, chairman hoặc ceo AME29)
  và agent AI đọc CÙNG 1 nguồn, nên sửa 1 chỗ là cả 2 nơi thấy ngay, không cần deploy lại.
  - **Google Maps tự động cập nhật, các nền tảng khác vẫn sửa tay** — Google Places API là nền
    tảng DUY NHẤT trong nhóm gmaps/hotpepper/instagram/tiktok/minimo/naily có API công khai hợp
    lệ để tự động lấy rating/số review; Hotpepper/Instagram/TikTok/Minimo không có, nên phần
    chữ tường thuật (`detail_vi`) và các nền tảng đó luôn cần founder tự sửa trên trang
    `/dashboard/competitors`. Điền `google_place_id` cho 1 tiệm (nút "Sửa" trên trang, hoặc cột
    `google_place_id` trong Supabase) là đủ để tiệm đó được tự động đồng bộ — tìm place_id qua
    [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id)
    của Google.
  - **Tự động mỗi ngày**: Vercel Cron (`vercel.json`, route
    `src/app/api/cron/sync-competitors/route.ts`) chạy `0 18 * * *` (18:00 UTC = 03:00 giờ Nhật
    hôm sau) cho MỌI business unit có dữ liệu — không chỉ AME29. Cần biến môi trường
    `GOOGLE_PLACES_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS vì cron không có phiên đăng
    nhập), và `CRON_SECRET` (Vercel tự gắn header `Authorization: Bearer $CRON_SECRET` vào các
    lần gọi theo lịch — route chặn mọi request khác để không ai đó lạ dùng hết quota Google
    Places của bạn). Thiếu `GOOGLE_PLACES_API_KEY` thì cron chạy nhưng không đồng bộ được gì,
    không lỗi gãy cả app. Cũng có nút **"Đồng bộ Google Maps"** ngay trên trang để chạy tay bất
    cứ lúc nào, không cần chờ lịch.
  - **Chiến lược Giá & Dịch vụ** (`can_read_competitors`): công cụ `get_competitor_data(topic)`
    với 4 chủ đề, mỗi lần gọi chỉ query đúng phần cần (tránh nhồi hết dữ liệu vào 1 lần gọi):
    `tong_quan` (điểm mạnh/yếu AME29 vs trung bình thị trường, đề xuất hành động, so sánh giá
    theo mô hình), `doi_thu_truc_tiep` (hồ sơ đa nền tảng chi tiết của các đối thủ gần AME29
    nhất ở khu Daikokucho, gồm cả AME29 để đối chiếu), `bang_xep_hang_osaka` (bảng xếp hạng ~45
    tiệm nổi bật ở Osaka), `doi_thu_toan_quoc` (top tiệm cao cấp toàn quốc tham khảo phân khúc
    giá cao — bài học từ la vela tokyo/Ginza). Dữ liệu vẫn có thể cũ hơn thực tế với các nền
    tảng sửa tay, nên hệ thống vẫn hướng dẫn agent ghi rõ "theo dữ liệu khảo sát" khi trả lời.
  - **Cần chạy lần lượt `0015_competitor_intel.sql`** (thêm cột `can_read_competitors` — vẫn
    cần dù không còn dùng file JSON tĩnh nữa), **`0016_competitor_live_schema.sql`** (tạo 6
    bảng + RLS), rồi **`0017_competitor_live_seed.sql`** (nạp dữ liệu gốc vào — file dài vì có
    ~260 câu insert, nhưng an toàn chạy lại nhiều lần) trên Supabase SQL Editor, đúng thứ tự.
- **Trang public `japannailmap.netlify.app` cũng đọc cùng dữ liệu sống** (`src/lib/public-
  competitor-payload.ts`, `src/app/api/public/ame29-dashboard/route.ts`,
  `supabase/migrations/0018_competitor_bilingual_schema.sql` →
  `0019_competitor_bilingual_seed.sql`): dashboard đứng riêng (host trên Netlify, không đăng
  nhập) gốc là file `AME29dashboard.html` founder tự làm — trước đây là 1 file tĩnh, giờ nó gọi
  `fetch` (thật ra là XHR đồng bộ, xem comment trong file) tới route **public, không cần đăng
  nhập** `/api/public/ame29-dashboard` để lấy dữ liệu mới nhất mỗi lần tải trang.
  - **Quyết định của founder: dữ liệu đối thủ này CÔNG KHAI trên internet** — ai có link cũng
    xem được, không cần tài khoản. Route dùng `SUPABASE_SERVICE_ROLE_KEY` để bypass RLS (bảng
    gốc vẫn chỉ chairman/ceo AME29 sửa được qua `/dashboard/competitors`) — route public này
    chỉ ĐỌC, không có đường ghi nào công khai cả.
  - **Vẫn giữ được nút chuyển Việt/Nhật** của trang gốc — migration 0018 thêm cột `*_ja` song
    song `*_vi` ở mọi bảng có chữ tường thuật, 0019 nạp lại toàn bộ dữ liệu kèm bản tiếng Nhật
    gốc từ `AME29dashboard.html` (agent AI ở mục trên vẫn chỉ dùng cột `_vi`, không đổi gì).
  - Phần chữ tĩnh thuần UI (nhãn nút, "bài học kinh nghiệm" menu/chăm sóc khách hàng...) KHÔNG
    nằm trong database — vẫn đóng gói cứng ngay trong file HTML (biến `STATIC_CONTENT`) vì nội
    dung đó gần như không đổi theo dữ liệu đối thủ.
  - **Cần chạy `0018_competitor_bilingual_schema.sql` rồi `0019_competitor_bilingual_seed.sql`**
    (sau 0015-0017) trên Supabase SQL Editor. Không cần biến môi trường mới ngoài
    `SUPABASE_SERVICE_ROLE_KEY` đã thêm ở mục Google Places phía trên.
  - File HTML đã sửa được gửi riêng cho founder — chỉ cần re-upload/redeploy đúng file đó lên
    Netlify, thay cho bản tĩnh cũ.
- **Agent xuất file thật (Excel/PDF/Word) thay vì chỉ trả lời chữ**
  (`src/lib/file-generator.ts`, công cụ `generate_file` trong `agent-runner.ts`,
  `supabase/migrations/0020_task_file_output.sql`): mọi agent có system prompt đều có công cụ
  này (không cần bật riêng như các công cụ khác) — cứ nói rõ trong "Giao việc" là cần xuất ra
  dạng gì (VD: "làm bảng Excel", "xuất file PDF báo cáo"), agent sẽ tự viết nội dung dạng
  Markdown đơn giản (tiêu đề, đoạn văn, bảng kiểu pipe table) rồi hệ thống dựng thành file thật
  — không nhờ AI tự "vẽ" file, tránh sai định dạng.
  - File được lưu vào đúng bucket `task-attachments` đã có sẵn (như file đính kèm), link tải về
    là link ký (signed URL) hết hạn sau 1 giờ, tạo mới mỗi lần cần (xem kết quả "Giao việc" hoặc
    mục "Lịch sử giao việc" bên dưới).
  - **PDF tiếng Việt**: pdfkit mặc định dùng font PDF chuẩn (Helvetica...) không có đủ dấu tiếng
    Việt — dự án nhúng sẵn font DejaVu Sans (`node_modules/dejavu-fonts-ttf`, cài qua npm, không
    phải tự tải file font) vì đã thử font "Vietnamese subset" của Google Fonts (qua gói
    `@fontsource`) và phát hiện nó thiếu cả chữ cái La-tinh thường (a-z) do cách Google tách nhỏ
    font theo unicode-range cho web — chỉ DejaVu Sans (font đầy đủ, không tách nhỏ) hiển thị
    đúng khi test bằng cách render thử ra ảnh. File/Word không cần nhúng font (Word/Excel dùng
    font máy người xem, tiếng Việt hiển thị bình thường).
  - `next.config.ts` có `outputFileTracingIncludes` ép Next.js đóng gói file font `.ttf` này vào
    bản deploy — thiếu dòng này thì chạy `npm run dev` local vẫn work nhưng lên Vercel sẽ lỗi
    500 khi tạo PDF vì Next tự động loại các file không được import tĩnh ra khỏi gói serverless.
  - **Cần chạy `supabase/migrations/0020_task_file_output.sql`** trên Supabase SQL Editor trước
    khi dùng — chỉ thêm 2 cột lưu đường dẫn/tên file trên bảng `tasks`.
- **Lịch sử giao việc không bị mất khi tắt màn hình**
  (`src/lib/actions/task-history.ts`, `task-history-panel.tsx`): trước đây kết quả "Giao việc"
  chỉ tồn tại trong bộ nhớ tạm của trình duyệt (state React) — tắt tab/màn hình là mất, dù dữ
  liệu vẫn nằm trong Supabase (dùng để agent "nhớ" các lần trước). Giờ mỗi agent có mục "Lịch sử
  giao việc" (bấm mở ra) xem lại tối đa 30 lần gần nhất — kèm cả ảnh/file đã tạo nếu có — bất kể
  đã đóng trình duyệt bao lâu, miễn còn đăng nhập được.
- **Nhãn "Mới" trên sơ đồ khi 1 agent vừa đóng góp ý kiến** (`supabase/migrations/
  0023_agent_last_task_completed.sql`, `network-view.tsx`): khi CEO giao việc lại cho cấp dưới
  (`delegate_to_agent`), phần việc đó vốn đã chạy thành 1 task thật gắn đúng agent cấp dưới —
  nhưng trước đây chỉ thấy được nếu tự bấm vào đúng card đó rồi mở "Lịch sử giao việc". Giờ card
  của agent nào vừa xong task (thành công hay lỗi) tự nổi viền xanh lá + nhãn "Mới" trong 3 phút,
  cập nhật qua Supabase Realtime — nhìn cả sơ đồ là biết ngay phòng ban nào vừa "lên tiếng" trong
  lần giao việc gần nhất, giống 1 cuộc họp thật, không cần bấm từng agent để kiểm tra.
  - **Cần chạy `0023_agent_last_task_completed.sql`** trên Supabase SQL Editor — thay lại hàm
    `set_agent_status` đã có (0009) để nó ghi thêm mốc thời gian, không cần sửa gì ở
    `agent-runner.ts`.
- **3 màn hình Knowledge Base / Báo cáo / Quyết định HĐQT** — bảng + RLS đã có từ migration
  0001/0002 (Phase 1) nhưng chưa có giao diện; giờ có link trên header ("Knowledge Base",
  "Báo cáo", "Quyết định HĐQT" — mục cuối chỉ chairman thấy) dẫn tới:
  - `/dashboard/knowledge` (`src/lib/actions/knowledge.ts`): ghi chú/kinh nghiệm dùng chung,
    ai trong công ty cũng thêm được, gắn được với 1 phòng ban cụ thể (tuỳ chọn).
  - `/dashboard/reports` (`src/lib/actions/reports.ts`,
    `supabase/migrations/0021_report_file_output.sql`): viết báo cáo tay, hoặc bấm **"Tạo báo
    cáo tổng quan tự động"** — gửi thẳng 1 "Giao việc" đã soạn sẵn cho CEO của công ty con đang
    xem, yêu cầu CEO tự hỏi Kế toán (doanh thu thật), tự đọc lịch trống hôm nay, hỏi Chiến lược
    Giá & Dịch vụ (vị thế đối thủ) rồi tổng hợp + xuất PDF bằng `generate_file` — không có logic
    mới nào ở tầng dưới cả, chỉ ghép lại đúng những công cụ agent đã có (delegate_to_agent,
    can_read_schedule, generate_file) thành 1 nút bấm. Chỉ hoạt động nếu công ty con đó có agent
    cấp executive với đúng các quyền/cấp dưới đó (hiện tại là AME29) — công ty con khác chưa có
    những agent này thì nút không hiện.
  - `/dashboard/decisions`: nhật ký quyết định cấp tập đoàn (title/bối cảnh/đề xuất/quyết
    định/lý do) — chairman-only theo đúng RLS `decisions_chairman_only` có sẵn.
  - **Cần chạy `supabase/migrations/0021_report_file_output.sql`** trên Supabase SQL Editor
    (chỉ thêm 2 cột file trên bảng `reports`, giống cách `tasks` đã có).
- **Câu trả lời hiển thị đẹp hơn (Markdown) + nghe được thay vì phải đọc**
  (`src/app/(dashboard)/dashboard/agent-output.tsx`, dùng `react-markdown` +
  `remark-gfm`): trước đây kết quả agent trả về hiện nguyên chữ thô — có `**`, `#`, `|` lộ ra
  thay vì in đậm/tiêu đề/bảng. Giờ toàn bộ chỗ hiện kết quả agent (mục "Kết quả" khi giao việc,
  "Đã giao lại cho" khi CEO uỷ quyền, "Lịch sử giao việc", báo cáo trong "Báo cáo") tự render
  đúng định dạng — khớp với việc agent vốn đã được dạy viết Markdown cho `generate_file`.
  - Mỗi chỗ có nút **"🔊 Nghe"** — đọc to câu trả lời bằng giọng đọc có sẵn của trình duyệt
    (Web Speech API, `lang: "vi-VN"`), miễn phí hoàn toàn, không gọi API nào, không tốn chi phí.
    Chỉ hiện nếu trình duyệt hỗ trợ (hầu hết trình duyệt hiện đại trên máy tính/điện thoại đều
    có); bấm lần nữa để dừng đọc giữa chừng.
  - Không cần chạy migration nào — chỉ là giao diện, không đổi schema.
- **"Phòng họp" — xem các phòng ban phối hợp trực tiếp + điều phối giữa chừng**
  (`/dashboard/room`, `src/app/(dashboard)/dashboard/room/`,
  `src/lib/actions/coordination.ts`, `supabase/migrations/0024_live_coordination.sql`):
  mỗi khi bạn giao việc cho 1 agent và agent đó tự giao lại cho cấp dưới
  (`delegate_to_agent`), toàn bộ chuỗi đó giờ hiện thành 1 "phiên" xem được trực tiếp — bên
  trái là danh sách các phiên gần đây, bên phải là từng agent tham gia hiện ra như tin nhắn
  chat, cập nhật ngay khi có thay đổi (Supabase Realtime), không cần bấm tải lại trang.
  - **Gõ thêm chỉ đạo giữa chừng**: gõ vào ô bên dưới rồi bấm "Gửi" — nội dung được agent
    đang chạy (bất kỳ agent nào trong chuỗi đang ở lượt xử lý) đọc vào lượt kế tiếp và tự điều
    chỉnh theo. Do agent chỉ kiểm tra chỉ đạo mới **1 lần mỗi lượt xử lý** (tối đa 2 lượt/agent
    — xem `MAX_TOOL_ROUNDS`), chỉ đạo có thể mất vài giây tới vài chục giây mới được agent
    "nhìn thấy", không phải tức thời tuyệt đối.
  - **"Dừng ngay"**: dừng mềm — đặt cờ, agent đang chạy tự kiểm tra và dừng ở lượt xử lý kế
    tiếp của nó (không phải dừng ngay lập tức giữa 1 lượt gọi Gemini), toàn bộ chuỗi (cả agent
    đang chạy lẫn các agent nó có thể giao tiếp theo) đều dừng theo vì dùng chung 1 phiên.
  - Không có worker nền riêng cho tính năng này — toàn bộ 1 lần "Giao việc" (kể cả khi giao
    việc xuống nhiều cấp) vẫn chạy trong đúng 1 request như trước, chỉ là giờ có thể theo dõi
    + can thiệp từ xa trong lúc nó đang chạy.
  - **Cần chạy `0024_live_coordination.sql`** trên Supabase SQL Editor — thêm cột
    `tasks.root_task_id`/`tasks.stop_requested`, bảng `task_messages`, và thêm cả 2 bảng
    `tasks`/`task_messages` vào Realtime publication.
- **Báo kết quả về điện thoại qua Telegram** (`src/lib/telegram.ts`): mỗi khi 1 "Giao việc"
  cấp cao nhất (không tính các lần agent tự giao lại cho cấp dưới bên trong) xong việc, lỗi,
  hoặc cần duyệt, hệ thống tự gửi tin nhắn Telegram — không cần mở máy/mở trình duyệt để biết
  kết quả. Miễn phí hoàn toàn qua Telegram Bot API.
  - **Cách tạo bot** (làm 1 lần): mở Telegram, chat với **@BotFather** → gõ `/newbot` → đặt
    tên bất kỳ → BotFather trả về 1 **token** (dạng `123456:ABC-DEF...`) — đó là
    `TELEGRAM_BOT_TOKEN`. Sau đó **nhắn bất kỳ tin nào** cho bot vừa tạo (bot không tự nhắn
    trước được), rồi mở trình duyệt vào
    `https://api.telegram.org/bot<TOKEN_VỪA_TẠO>/getUpdates` — tìm số ở
    `"chat":{"id": ...}` trong kết quả trả về, đó là `TELEGRAM_CHAT_ID`.
  - Thêm 2 biến `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID` vào Vercel Environment Variables
    rồi deploy lại — thiếu 1 trong 2 biến thì tính năng tự tắt êm, không lỗi gì cả.
  - Không cần chạy migration nào.
- **Agent hoạt động 24/7 — hàng đợi việc chạy nền + báo cáo tự động hàng ngày**
  (`supabase/migrations/0025_task_queue.sql`, `src/lib/queue-runner.ts`,
  `src/lib/actions/queue.ts`, `src/app/api/cron/process-queue/route.ts`,
  `src/app/api/cron/daily-report/route.ts`): 2 cách để agent tự làm việc mà không cần bạn
  ngồi chờ trước màn hình.
  - **Hàng đợi chạy nền**: khi giao việc (chưa đính kèm file), thay vì bấm "Gửi" (chờ ngay
    tại chỗ) có thể bấm **"Xếp hàng đợi (chạy nền)"** — việc được ghi vào hàng đợi và trả lời
    ngay "đã xếp hàng", không phải chờ. Vercel Cron tự chạy vét hàng đợi mỗi ~15 phút (xem
    `vercel.json`), kết quả báo qua Telegram; xem tiến độ + bấm **"Xử lý hàng đợi ngay"** để
    chạy thử ngay (không chờ Cron) trong mục "Hàng đợi việc chạy nền" ở `/dashboard/room`.
    Chưa hỗ trợ đính kèm file trong hàng đợi (chỉ chữ).
  - **Báo cáo tổng quan tự động mỗi ngày**: cron riêng chạy 8h sáng (giờ Nhật) cho MỌI công ty
    con đang có agent executive (CEO) — tự chạy đúng luồng "Tạo báo cáo tổng quan tự động" đã
    có sẵn ở `/dashboard/reports` (hỏi Kế toán doanh thu, đọc lịch trống, hỏi vị thế cạnh
    tranh, xuất PDF) và lưu thẳng vào "Báo cáo" + báo Telegram — không cần bấm nút.
  - **Giới hạn cần biết về Vercel Cron**: gói **miễn phí (Hobby)** của Vercel giới hạn cron
    job chỉ chạy **tối đa 1 lần/ngày** mỗi job (dù file cấu hình ghi 15 phút/lần, Vercel Hobby
    sẽ tự giới hạn lại) — muốn hàng đợi tự chạy nhiều lần/ngày thật sự cần nâng cấp **Vercel
    Pro**. Trong lúc đó, nút "Xử lý hàng đợi ngay" vẫn dùng được bình thường bất kỳ lúc nào.
  - **Cần chạy `0025_task_queue.sql`** trên Supabase SQL Editor — tạo bảng `task_queue` mới.
  - **Cần deploy lại trên Vercel** để 2 cron job mới (`daily-report`, `process-queue`) trong
    `vercel.json` được đăng ký — Vercel chỉ đọc file này lúc deploy.

**Nếu push code lên GitHub xong mà Vercel không tự deploy** (trang Deployments không thấy
commit mới nhất xuất hiện, dù GitHub đã có đúng code mới): thường do webhook GitHub → Vercel bị
"trượt" 1 lần, không phải do code hay do bạn thao tác sai. Cách xử lý theo thứ tự:
1. Vào project trên Vercel → **Deployments** → xem commit mới nhất trên GitHub (`git log`) có
   xuất hiện trong danh sách không.
2. Nếu chưa thấy sau vài phút, thử push thêm 1 commit nhỏ bất kỳ (kể cả sửa 1 dòng trong
   README) — nếu commit MỚI này tự lên được, nghĩa là webhook đã tự hồi phục, chỉ bỏ lỡ đúng
   lần trước đó (bỏ qua, không cần làm gì thêm).
3. Nếu vẫn không tự deploy: vào **Project Settings → Git** → bấm **Disconnect**, rồi kết nối
   lại đúng repo đó (tạo lại webhook từ đầu) — không ảnh hưởng đến Environment Variables hay
   domain đã cấu hình, chỉ tạo lại đường dây báo "có code mới" giữa GitHub và Vercel.

**TODO — chưa kết nối thật:**
- [x] ~~Chưa có cơ chế agent tự động chuyển việc/file cho agent khác~~ (đã xây — xem mục
      "Agent tự giao lại việc" ở trên; file đính kèm gốc thì chưa chuyển theo, chỉ có nội
      dung chữ được giao lại).
- [x] ~~Panel agent chưa hiện lại danh sách lịch sử task cũ để xem trực tiếp~~ (đã xây — mục
      "Lịch sử giao việc không bị mất khi tắt màn hình" ở trên).
- [ ] Chưa có UI sửa/xoá company/department/agent (mới có tạo mới); sửa/xoá qua Supabase
      Table Editor trong lúc chưa có UI quản trị đầy đủ.
- [ ] Chưa có UI gán role/business_unit_id cho user mới (mặc định mọi user mới là `staff`,
      không thuộc business unit nào — chairman phải tự sửa trong Supabase Table Editor).
- [x] ~~4 role quản lý mới chưa có system prompt~~ (đã điền — xem `0007_manager_prompts.sql`
      ở trên).
- [x] ~~`responsibilities/tools/kpi/escalation_note` đã có cột trong schema nhưng chưa điền
      giá trị thật cho từng agent~~ (đã điền cho cả 19 agent AME29 —
      `supabase/migrations/0022_agent_role_details.sql`, soạn dựa trên system_prompt và
      reports_to đã có sẵn của từng agent, không bịa thêm dữ kiện kinh doanh mới — founder nên
      đọc lại và sửa nếu có chỗ không đúng thực tế. `approval_level` đã điền cho AME29 — xem trên.)
- [ ] Chưa có bảng `workflows` riêng cho Google Review workflow (chỉ mới cơ chế approval
      1/2/3 chung, dùng `tasks.status` — xem trên).
- [x] ~~Knowledge Base / Report / Decision Log: bảng + RLS đã có, nhưng chưa có màn hình để
      tạo/xem~~ (đã xây — mục "3 màn hình Knowledge Base / Báo cáo / Quyết định HĐQT" ở trên).
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
