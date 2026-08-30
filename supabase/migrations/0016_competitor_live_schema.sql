-- Turns the static competitor-intel.json (migration 0015) into live tables:
-- a manual edit (Hotpepper/Instagram/TikTok text, pricing, action checklist)
-- shows up immediately for both the dashboard and the get_competitor_data
-- agent tool — no more re-running an extraction script and redeploying.
-- Google Maps rating/review_count can additionally be kept fresh
-- automatically via Google Places API for any row with a google_place_id
-- set (see src/lib/google-places.ts) — everything else stays manual, since
-- Hotpepper/Instagram/TikTok/Minimo have no public API for this.
create table competitors (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  group_key text not null check (group_key in ('daikokucho_direct', 'osaka_top', 'national_top')),
  name text not null,
  area text,
  city text,
  is_ame29 boolean not null default false,
  price_vi text,
  google_place_id text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_unit_id, group_key, name)
);

create table competitor_platform_stats (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  platform text not null check (platform in ('gmaps', 'hotpepper', 'instagram', 'tiktok', 'minimo', 'naily')),
  rating numeric,
  review_count int,
  summary_vi text,
  detail_vi text,
  url text,
  source text not null default 'manual' check (source in ('manual', 'google_places_api')),
  synced_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (competitor_id, platform)
);

create table competitor_scorecard (
  business_unit_id uuid not null references business_units(id) on delete cascade,
  key text not null,
  label_vi text not null,
  ame29_score numeric not null,
  avg_score numeric not null,
  sort_order int not null default 0,
  primary key (business_unit_id, key)
);

create table competitor_actions (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  legacy_id text not null,
  description_vi text not null,
  done boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  unique (business_unit_id, legacy_id)
);

create table competitor_price_benchmark (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  segment text not null default 'price_bench' check (segment in ('price_bench', 'ginza_compare')),
  name text not null,
  model_vi text,
  price_low_vi text,
  price_high_vi text,
  note_vi text,
  is_ame29 boolean not null default false,
  sort_order int not null default 0,
  unique (business_unit_id, segment, name)
);

create table competitor_city_rollup (
  business_unit_id uuid not null references business_units(id) on delete cascade,
  city text not null,
  salon_count int,
  avg_rating numeric,
  avg_reviews numeric,
  total_reviews int,
  primary key (business_unit_id, city)
);

-- RLS: same shape as knowledge_entries/departments (migration 0002) — read
-- scoped to your own business unit, write allowed for chairman or the ceo of
-- that unit. competitor_platform_stats has no business_unit_id of its own,
-- so it's scoped through its parent competitor row instead.
alter table competitors enable row level security;
alter table competitor_platform_stats enable row level security;
alter table competitor_scorecard enable row level security;
alter table competitor_actions enable row level security;
alter table competitor_price_benchmark enable row level security;
alter table competitor_city_rollup enable row level security;

create policy "competitors_select" on competitors
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitors_write" on competitors
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

create policy "competitor_platform_stats_select" on competitor_platform_stats
  for select to authenticated using (
    competitor_id in (
      select id from competitors
      where public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
    )
  );
create policy "competitor_platform_stats_write" on competitor_platform_stats
  for all to authenticated using (
    competitor_id in (
      select id from competitors
      where public.is_chairman()
        or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
    )
  ) with check (
    competitor_id in (
      select id from competitors
      where public.is_chairman()
        or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
    )
  );

create policy "competitor_scorecard_select" on competitor_scorecard
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitor_scorecard_write" on competitor_scorecard
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

create policy "competitor_actions_select" on competitor_actions
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitor_actions_write" on competitor_actions
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

create policy "competitor_price_benchmark_select" on competitor_price_benchmark
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitor_price_benchmark_write" on competitor_price_benchmark
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );

create policy "competitor_city_rollup_select" on competitor_city_rollup
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "competitor_city_rollup_write" on competitor_city_rollup
  for all to authenticated using (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  ) with check (
    public.is_chairman()
    or (public.current_user_role() = 'ceo' and business_unit_id = public.current_user_business_unit_id())
  );
