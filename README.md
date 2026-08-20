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

**TODO — chưa kết nối thật:**
- [x] ~~Chưa có cơ chế agent tự động chuyển việc/file cho agent khác~~ (đã xây — xem mục
      "Agent tự giao lại việc" ở trên; file đính kèm gốc thì chưa chuyển theo, chỉ có nội
      dung chữ được giao lại).
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
