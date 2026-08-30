-- Adds Japanese-language columns alongside the existing Vietnamese ones, and
-- a new table for the full 233-salon index — both needed so the standalone
-- public dashboard (japannailmap.netlify.app) can go live off this same
-- database without losing its Vietnamese/Japanese language toggle or its
-- "top 15 by reviews" / "rating vs review" charts, which need the full raw
-- salon list rather than the curated ~76-competitor subset in `competitors`.
alter table competitors add column if not exists price_ja text;

alter table competitor_platform_stats add column if not exists summary_ja text;
alter table competitor_platform_stats add column if not exists detail_ja text;

alter table competitor_scorecard add column if not exists label_ja text;

alter table competitor_actions add column if not exists description_ja text;

alter table competitor_price_benchmark add column if not exists model_ja text;
alter table competitor_price_benchmark add column if not exists price_low_ja text;
alter table competitor_price_benchmark add column if not exists price_high_ja text;
alter table competitor_price_benchmark add column if not exists note_ja text;

-- Full raw salon list (233 entries) — only name/area/rating/review_count,
-- no per-platform detail. Used only for the two chart types on the public
-- dashboard (top 15 by reviews, rating-vs-reviews scatter) and the
-- SALONS-driven city rollup source data; NOT used by the get_competitor_data
-- agent tool (that only needs the curated groups already in `competitors`).
create table competitor_salon_index (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  name text not null,
  area text,
  rating numeric,
  review_count int,
  is_ame29 boolean not null default false,
  sort_order int not null default 0,
  unique (business_unit_id, name)
);

alter table competitor_salon_index enable row level security;

create policy "competitor_salon_index_select" on competitor_salon_index
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitor_salon_index_write" on competitor_salon_index
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );
