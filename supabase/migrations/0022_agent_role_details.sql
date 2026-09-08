-- Fills responsibilities/tools/kpi/escalation_note for all 19 real AME29
-- agents (confirmed against the live `agents` table, not guessed) — every
-- line here is derived directly from that agent's own system_prompt
-- (0004_seed_ame29_agents.sql / 0007_manager_prompts.sql), the org chart
-- (reports_to) already set up, and standard job-description content for
-- that role. Nothing here invents new business facts (no prices, revenue
-- targets, or policies not already stated elsewhere) — founder should
-- still read through and edit anything that doesn't match reality.
-- "Phiên dịch Đa ngôn ngữ" already has an escalation_note (0004) — left
-- untouched here, only responsibilities/tools/kpi added.

update agents set
  responsibilities = array[
    'Định hướng chiến lược mở rộng chi nhánh',
    'Điều phối giữa các phòng ban',
    'Duyệt các quyết định lớn trước khi báo cáo Chủ tịch TNT Corporation',
    'Theo dõi tình hình kinh doanh tổng thể (doanh thu, lịch vận hành, vị thế cạnh tranh)'
  ],
  tools = '["Trợ lý Lịch trình (Chief of Staff)", "App đặt lịch Firebase (đọc lịch trống)", "Báo cáo tổng quan tự động"]'::jsonb,
  kpi = '["Tăng trưởng doanh thu theo quý", "Tiến độ chuẩn bị mở chi nhánh mới", "Tỷ lệ khung giờ trống được lấp đầy"]'::jsonb,
  escalation_note = 'Việc vượt quá thẩm quyền công ty con (ngân sách lớn, pháp lý phức tạp, quyết định ảnh hưởng thương hiệu TNT) trình lên Chủ tịch HĐQT TNT Corporation.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'CEO AME29';

update agents set
  responsibilities = array[
    'Quản lý lịch làm việc nhân viên hằng ngày',
    'Xử lý booking khách trực tiếp',
    'Giám sát vận hành salon hằng ngày',
    'Quản lý nhân sự cấp vận hành'
  ],
  tools = '["App đặt lịch/booking của salon (Firebase)", "Trợ lý Lịch trình"]'::jsonb,
  kpi = '["Không có xung đột lịch/booking trùng giờ", "Khách được phục vụ đúng giờ hẹn", "Mức độ hài lòng của nhân viên về ca làm việc"]'::jsonb,
  escalation_note = 'Vấn đề nhân sự nghiêm trọng hoặc cần ngân sách vượt mức vận hành hằng ngày báo cáo CEO AME29.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Quản lý Salon';

update agents set
  responsibilities = array[
    'Tổng hợp báo cáo tài chính từ Kế toán',
    'Theo dõi và cảnh báo sớm bất thường dòng tiền',
    'Duyệt các đề xuất tài chính trước khi trình CEO',
    'Không tự quyết chi tiêu lớn'
  ],
  tools = '["Báo cáo từ Kế toán trưởng"]'::jsonb,
  kpi = '["Báo cáo tài chính nộp đúng hạn", "Phát hiện bất thường dòng tiền kịp thời", "Không có chi tiêu vượt duyệt"]'::jsonb,
  escalation_note = 'Chi tiêu lớn hoặc bất thường tài chính nghiêm trọng trình CEO AME29 quyết định — không tự quyết.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Finance Manager';

update agents set
  responsibilities = array[
    'Tổng hợp vấn đề pháp lý/hành chính đang mở',
    'Đánh giá mức độ khẩn cấp từng việc',
    'Đầu mối duyệt trước khi trình CEO các việc cần ký kết chính thức',
    'Điều phối Luật sư Thuế, Cố vấn Hành chính - Pháp lý, và Phiên dịch khi cần'
  ],
  tools = '["Tổng hợp từ Luật sư Thuế và Cố vấn Hành chính - Pháp lý"]'::jsonb,
  kpi = '["Vấn đề pháp lý được xử lý/theo dõi đúng hạn", "Không có hồ sơ hành chính quá hạn nộp"]'::jsonb,
  escalation_note = 'Việc cần ký kết chính thức hoặc rủi ro pháp lý cao trình CEO AME29 — bản thân chỉ tư vấn tham khảo.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Admin & Legal Manager';

update agents set
  responsibilities = array[
    'Theo dõi hiệu quả các kênh TikTok/Facebook/Instagram/Google Maps',
    'Điều phối nội dung và visibility nhất quán giữa các kênh',
    'Duyệt campaign lớn từ Content Director',
    'Trình CEO khi cần ngân sách marketing'
  ],
  tools = '["Content Director (nội dung)", "Google Maps Master (local SEO)", "TikTok/Facebook/Instagram Agent"]'::jsonb,
  kpi = '["Tổng lượt tương tác các kênh tăng theo thời gian", "Campaign triển khai đúng lịch", "Thông điệp thương hiệu đồng nhất giữa các kênh"]'::jsonb,
  escalation_note = 'Campaign cần ngân sách hoặc ảnh hưởng thương hiệu lớn trình CEO AME29 duyệt trước khi triển khai.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Marketing Director';

update agents set
  responsibilities = array[
    'Đảm bảo thiết kế nhất quán với hình ảnh thương hiệu salon',
    'Góp ý khi ý tưởng đồ họa lệch hướng',
    'Đầu mối duyệt concept trước khi triển khai thật'
  ],
  tools = '["Đồ họa & Thương hiệu MỀU (tạo ảnh AI)"]'::jsonb,
  kpi = '["Thiết kế được duyệt đúng hạn", "Mức độ nhất quán thương hiệu qua các ấn phẩm"]'::jsonb,
  escalation_note = 'Thay đổi định vị thương hiệu lớn cần founder/CEO AME29 duyệt trực tiếp.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Brand & Design Manager';

update agents set
  responsibilities = array[
    'Viết nội dung gốc (caption, kịch bản video, bài đăng)',
    'Không tự đăng bài — giao cho từng agent mạng xã hội tối ưu riêng',
    'Đảm bảo giọng văn phù hợp khách Nhật và cộng đồng Việt tại Nhật'
  ],
  tools = '["TikTok Agent", "Facebook Agent", "Instagram Agent", "Quy tắc cố định riêng cho từng nền tảng"]'::jsonb,
  kpi = '["Nội dung gốc sản xuất đều đặn theo lịch", "Nội dung được các agent nền tảng dùng không cần chỉnh sửa lớn"]'::jsonb,
  escalation_note = 'Định hướng nội dung lớn hoặc nhạy cảm báo cáo Marketing Director trước khi triển khai.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Content Director';

update agents set
  responsibilities = array[
    'Ghi sổ sách theo chuẩn kế toán Nhật cơ bản',
    'Theo dõi dòng tiền thực tế',
    'Trả lời câu hỏi tài chính dựa trên dữ liệu thật, không suy đoán'
  ],
  tools = '["get_revenue_report — dữ liệu doanh thu thật từ Firebase"]'::jsonb,
  kpi = '["Số liệu báo cáo khớp với dữ liệu thật", "Luôn nêu rõ cần hỏi thêm gì khi thiếu dữ liệu, không tự bịa"]'::jsonb,
  escalation_note = 'Bất thường dòng tiền hoặc cần quyết định chi tiêu báo cáo Finance Manager.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Kế toán';

update agents set
  responsibilities = array[
    'Tư vấn nghĩa vụ thuế doanh nghiệp',
    'Nhắc thời hạn kê khai thuế',
    'Gợi ý cách tối ưu thuế hợp pháp'
  ],
  tools = '["Kiến thức thuế Nhật Bản (tham khảo)"]'::jsonb,
  kpi = '["Không bỏ lỡ thời hạn kê khai nào", "Luôn nói rõ giới hạn tư vấn tham khảo"]'::jsonb,
  escalation_note = 'Hồ sơ chính thức cần ký kết chuyển cho 税理士 (thuế sư) có chứng chỉ — đây chỉ là tư vấn tham khảo. Vấn đề phát sinh báo Admin & Legal Manager.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Luật sư Thuế';

update agents set
  responsibilities = array[
    'Hỗ trợ giấy phép kinh doanh',
    'Tư vấn visa/tư cách lưu trú liên quan tới công ty',
    'Hỗ trợ hợp đồng thuê mặt bằng và hợp đồng lao động'
  ],
  tools = '["Kiến thức hành chính Nhật Bản (tham khảo)"]'::jsonb,
  kpi = '["Thủ tục hành chính được theo dõi, không quá hạn", "Luôn nói rõ giới hạn tư vấn tham khảo"]'::jsonb,
  escalation_note = 'Việc ký kết chính thức chuyển cho 行政書士 hoặc luật sư có chứng chỉ. Vấn đề phát sinh báo Admin & Legal Manager.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Cố vấn Hành chính - Pháp lý';

-- escalation_note đã có sẵn (0004) — không đụng vào, chỉ thêm 3 cột còn lại.
update agents set
  responsibilities = array[
    'Dịch song ngữ Anh/Nhật theo yêu cầu hoặc ngữ cảnh',
    'Dùng kính ngữ (敬語) phù hợp khi dịch sang tiếng Nhật cho giao tiếp kinh doanh',
    'Phục vụ chung cho mọi phòng ban khi cần'
  ],
  tools = '["Dịch thuật Anh-Việt-Nhật"]'::jsonb,
  kpi = '["Bản dịch chính xác, đúng văn phong kinh doanh", "Phản hồi nhanh khi phòng ban khác cần dùng"]'::jsonb
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Phiên dịch Đa ngôn ngữ';

update agents set
  responsibilities = array[
    'Sắp xếp lịch trình và nhắc việc cho founder',
    'Ưu tiên công việc theo mức độ khẩn cấp',
    'Cân đối giữa công việc kiến trúc sư full-time và vận hành công ty ngoài giờ của founder'
  ],
  tools = '["Lịch cá nhân của founder"]'::jsonb,
  kpi = '["Không bỏ lỡ việc khẩn cấp nào", "Danh sách ưu tiên rõ ràng, cập nhật đều"]'::jsonb,
  escalation_note = 'Xung đột lịch nghiêm trọng hoặc cần quyết định vận hành báo cáo Quản lý Salon.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Trợ lý Lịch trình';

update agents set
  responsibilities = array[
    'Tối ưu nội dung từ Content Director riêng cho TikTok',
    'Áp dụng hook 3 giây đầu, nhạc/trend thịnh hành',
    'Viết theo quy tắc cố định: ngắn gọn, Hook + Sell + CTA + 5 hashtag chuẩn kèm #AME29'
  ],
  tools = '["TikTok"]'::jsonb,
  kpi = '["Video đăng đều đặn theo lịch", "Lượt xem/tương tác tăng dần theo thời gian"]'::jsonb,
  escalation_note = 'Nội dung nhạy cảm hoặc cần ngân sách quảng cáo báo cáo Content Director.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'TikTok Agent';

update agents set
  responsibilities = array[
    'Tối ưu nội dung từ Content Director riêng cho Facebook',
    'Viết bài đăng dài hơn, phù hợp cộng đồng người Việt tại Nhật',
    'Gợi ý thời điểm đăng và đề xuất quảng cáo nhỏ nếu phù hợp'
  ],
  tools = '["Facebook"]'::jsonb,
  kpi = '["Bài đăng đều đặn theo lịch", "Tương tác cộng đồng Việt tại Nhật tăng dần"]'::jsonb,
  escalation_note = 'Đề xuất chạy quảng cáo cần ngân sách báo cáo Content Director.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Facebook Agent';

update agents set
  responsibilities = array[
    'Tối ưu nội dung từ Content Director riêng cho Instagram',
    'Ưu tiên hình ảnh đẹp, Reels ngắn, tính thẩm mỹ cao',
    'Gợi ý bố cục ảnh và hashtag địa phương Osaka'
  ],
  tools = '["Instagram"]'::jsonb,
  kpi = '["Chất lượng hình ảnh/Reels đạt chuẩn thẩm mỹ", "Tương tác tăng dần theo thời gian"]'::jsonb,
  escalation_note = 'Vấn đề hình ảnh thương hiệu báo cáo Content Director hoặc Brand & Design Manager.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Instagram Agent';

update agents set
  responsibilities = array[
    'Tối ưu hồ sơ Google Business Profile (ảnh, mô tả, giờ mở cửa)',
    'Hướng dẫn cách xin và trả lời review khách',
    'Tối ưu từ khóa local SEO'
  ],
  tools = '["Google Business Profile", "Google Maps"]'::jsonb,
  kpi = '["Số lượng và điểm trung bình review tăng dần", "Hồ sơ Google Maps luôn cập nhật đầy đủ"]'::jsonb,
  escalation_note = 'Review tiêu cực nghiêm trọng hoặc khủng hoảng truyền thông báo cáo Marketing Director.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Google Maps Master';

update agents set
  responsibilities = array[
    'Lên ý tưởng mẫu nail mới',
    'Phát triển mascot thương hiệu MỀU',
    'Tạo ảnh thật từ ý tưởng bằng công cụ tạo ảnh AI'
  ],
  tools = '["Gemini image generation (miễn phí)"]'::jsonb,
  kpi = '["Ý tưởng được triển khai thành mô tả/ảnh cụ thể, dùng được ngay", "Tính nhất quán hình ảnh mascot MỀU qua các lần tạo"]'::jsonb,
  escalation_note = 'Thay đổi lớn về hình ảnh mascot/thương hiệu báo cáo Brand & Design Manager.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Đồ họa & Thương hiệu MỀU';

update agents set
  responsibilities = array[
    'Tư vấn cấu trúc bảng giá, gói combo, giá theo mùa/sự kiện',
    'Đề xuất cách hiển thị dịch vụ trên app đặt lịch',
    'Phân tích vị thế cạnh tranh dựa trên dữ liệu đối thủ thật',
    'Đề xuất lấp khung giờ trống bằng khuyến mãi khi CEO giao'
  ],
  tools = '["get_competitor_data — dữ liệu đối thủ thật", "App đặt lịch của salon"]'::jsonb,
  kpi = '["Đề xuất giá có số liệu cụ thể, dựa trên dữ liệu thật", "Tỷ lệ đề xuất được founder áp dụng"]'::jsonb,
  escalation_note = 'Thay đổi giá chính thức phải được CEO AME29/founder duyệt — chỉ đề xuất, không tự áp dụng.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Chiến lược Giá & Dịch vụ';

update agents set
  responsibilities = array[
    'Đặt câu hỏi mở theo phong cách Socratic để founder tự đào sâu ý tưởng',
    'Không đưa ra đáp án hay kết luận thay người dùng'
  ],
  tools = '["Phương pháp đặt câu hỏi Socratic"]'::jsonb,
  kpi = '["Câu hỏi đủ sắc bén để mở ra góc nhìn mới", "Không lấn sang việc kết luận thay founder"]'::jsonb,
  escalation_note = 'Không áp dụng — vai trò chỉ đặt câu hỏi, không ra quyết định hay báo cáo lên cấp nào.'
where business_unit_id = (select id from business_units where name = 'AME29') and name = 'Cố vấn Ý tưởng';
