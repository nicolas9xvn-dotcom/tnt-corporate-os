-- A standing style/quality rule for an agent — separate from the rolling
-- 20-task memory (agent-history.ts), which can get pushed out over time.
-- Once set, house_rules is prepended to every future call to that agent
-- until the founder explicitly changes or clears it (see
-- src/lib/actions/house-rules.ts).
alter table agents add column if not exists house_rules text;
