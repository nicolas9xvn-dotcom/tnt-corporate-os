-- Founder decision (2026-08-20): agents requiring approval before running a
-- task. Level 2 = chairman or the ceo of AME29 can approve; level 3 = only
-- chairman. Every other agent stays NULL (auto-run).

update agents
set approval_level = 2
where business_unit_id = (select id from business_units where name = 'AME29')
  and name in (
    'Content Director',
    'Chiến lược Giá & Dịch vụ',
    'Luật sư Thuế',
    'Cố vấn Hành chính - Pháp lý'
  );

update agents
set approval_level = 3
where business_unit_id = (select id from business_units where name = 'AME29')
  and name = 'CEO AME29';
