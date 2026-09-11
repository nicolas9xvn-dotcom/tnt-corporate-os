-- AME29 Content OS — Phase 1 (MVP): Google Drive ingestion + AI classification.
-- Original photo/video bytes live ONLY in Google Drive (drive_file_id is the
-- pointer back to the real file) — Supabase never stores a copy, matching
-- the founder's core rule that originals are never touched/duplicated.

-- Which Drive folder (the "AME29 PHOTO LIBRARY" root) belongs to this
-- business unit, and a watermark of how far the ingestion cron has already
-- checked — so it only ever asks Drive for files created after last time.
alter table business_units add column if not exists google_drive_root_folder_id text;
alter table business_units add column if not exists google_drive_last_synced_at timestamptz;

-- A NAIL SET groups several assets (hero/detail/pose/video) that are the
-- same physical nail set — see nail-set-grouping in the ingestion pipeline.
-- Created before content_assets since assets reference it.
create table if not exists nail_sets (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  set_code text not null, -- AME29-NAIL-202609-015
  design_summary text,
  tags text[],
  created_at timestamptz not null default now()
);
create index if not exists nail_sets_business_unit_id_idx on nail_sets (business_unit_id);

create table if not exists content_assets (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  asset_code text not null, -- AME29-202609-0001
  drive_file_id text not null,
  drive_md5 text, -- Drive's own md5Checksum — used for duplicate detection, no need to hash ourselves
  file_type text not null check (file_type in ('photo', 'video')),
  original_filename text not null,

  category text check (category in ('NAIL', 'PARTS_CHARM', 'SALON', 'PROCESS', 'PEOPLE', 'CUSTOMER', 'BRAND_MOOD')),
  subcategory text,
  confidence numeric,
  review_reason text,

  primary_subject text,
  secondary_subjects text[],
  design text,
  color text,
  nail_length text,
  nail_shape text,
  parts text[],
  has_3d boolean,
  style text,
  hand_pose text,
  visual_quality_score numeric,
  content_potential text[],

  nail_set_id uuid references nail_sets(id),
  status text not null default 'UNUSED' check (
    status in ('UNUSED', 'SELECTED', 'IN_PRODUCTION', 'APPROVED', 'SCHEDULED', 'POSTED', 'ARCHIVED', 'REVIEW')
  ),

  reviewed_by uuid references users(id),
  classified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists content_assets_business_unit_id_idx on content_assets (business_unit_id);
create index if not exists content_assets_nail_set_id_idx on content_assets (nail_set_id);
create unique index if not exists content_assets_drive_file_id_key on content_assets (drive_file_id);

-- Phase 4 derivatives (4:5/9:16 crops) — kept separate from the original
-- row so content_assets always reflects the untouched source file.
create table if not exists content_processed_files (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references content_assets(id) on delete cascade,
  variant text not null, -- 'instagram_4x5' | 'tiktok_9x16' | 'story_9x16'
  drive_file_id text not null,
  created_at timestamptz not null default now()
);

-- Audit trail for the ingestion pipeline itself (mục 6/9 của bản thiết kế) —
-- separate from content_assets so a failed/skipped file still leaves a
-- record even if no asset row was ever created for it.
create table if not exists drive_sync_log (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid references business_units(id) on delete cascade,
  drive_file_id text,
  event text not null, -- 'detected' | 'classified' | 'moved' | 'duplicate_skipped' | 'error'
  status text not null check (status in ('ok', 'error')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists drive_sync_log_business_unit_id_idx on drive_sync_log (business_unit_id);

-- One row per manual correction in the REVIEW queue — fed back into the
-- classification prompt as recent examples (a lightweight learning loop,
-- not model retraining, since Gemini here isn't fine-tuned).
create table if not exists classification_feedback (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references content_assets(id) on delete cascade,
  ai_category text,
  human_category text not null,
  corrected_by uuid references users(id),
  corrected_at timestamptz not null default now()
);

alter table nail_sets enable row level security;
alter table content_assets enable row level security;
alter table content_processed_files enable row level security;
alter table drive_sync_log enable row level security;
alter table classification_feedback enable row level security;

create policy "nail_sets_select" on nail_sets
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

create policy "content_assets_select" on content_assets
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );
create policy "content_assets_update" on content_assets
  for update to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

create policy "content_processed_files_select" on content_processed_files
  for select to authenticated using (
    public.is_chairman()
    or exists (
      select 1 from content_assets a
      where a.id = content_processed_files.asset_id
        and a.business_unit_id = public.current_user_business_unit_id()
    )
  );

create policy "drive_sync_log_select" on drive_sync_log
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

create policy "classification_feedback_select" on classification_feedback
  for select to authenticated using (
    public.is_chairman()
    or exists (
      select 1 from content_assets a
      where a.id = classification_feedback.asset_id
        and a.business_unit_id = public.current_user_business_unit_id()
    )
  );
create policy "classification_feedback_insert" on classification_feedback
  for insert to authenticated with check (
    public.is_chairman()
    or exists (
      select 1 from content_assets a
      where a.id = classification_feedback.asset_id
        and a.business_unit_id = public.current_user_business_unit_id()
    )
  );

-- All writes from the ingestion pipeline itself go through the service-role
-- key (Vercel Cron route, see api/cron/process-inbox) and bypass RLS
-- entirely — these policies only govern what the Content OS dashboard
-- (normal signed-in users) can see/do.
