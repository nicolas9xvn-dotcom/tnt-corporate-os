-- Content OS Phase 2: real social publishing + tracking. Lets a business
-- unit connect its actual Facebook Page / Instagram Business account /
-- TikTok account (OAuth, see src/app/api/social/**), then publish a
-- content_calendar item to the real platform and keep engagement numbers
-- in sync (see src/app/api/cron/sync-social-metrics).

create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references business_units(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram', 'tiktok')),
  account_name text not null,
  external_account_id text not null, -- Facebook Page ID / IG Business Account ID / TikTok open_id
  status text not null default 'connected' check (status in ('connected', 'expired', 'error')),
  status_detail text,
  connected_by uuid references users(id),
  connected_at timestamptz not null default now(),
  unique (business_unit_id, platform, external_account_id)
);
create index if not exists social_accounts_business_unit_id_idx on social_accounts (business_unit_id);

-- Access/refresh tokens live in their own table with NO policies at all —
-- RLS is enabled but no policy grants the `authenticated` role any access,
-- so only the service-role key (used exclusively by the OAuth callback
-- routes and the publish/sync-metrics server code, never by
-- browser-facing queries) can ever read or write a token. This keeps a
-- page-scoped Facebook/TikTok token from ever being selectable from a
-- normal signed-in dashboard session, even by accident (e.g. a stray
-- `select *` on social_accounts would never expose it since it's a
-- separate table).
create table if not exists social_account_tokens (
  social_account_id uuid primary key references social_accounts(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz
);

-- What to post and what came back — extends the existing manual calendar
-- (migration 0028) instead of a separate table, since a calendar item and
-- its real post are the same real-world thing.
alter table content_calendar add column if not exists content_asset_id uuid references content_assets(id);
alter table content_calendar add column if not exists caption text;
alter table content_calendar add column if not exists social_account_id uuid references social_accounts(id);
alter table content_calendar add column if not exists external_post_id text;
alter table content_calendar add column if not exists permalink text;
alter table content_calendar add column if not exists published_at timestamptz;
alter table content_calendar add column if not exists publish_error text;
alter table content_calendar add column if not exists last_synced_at timestamptz;
alter table content_calendar add column if not exists likes_count integer;
alter table content_calendar add column if not exists comments_count integer;
alter table content_calendar add column if not exists shares_count integer;
alter table content_calendar add column if not exists views_count integer;

alter table social_accounts enable row level security;
alter table social_account_tokens enable row level security;

create policy "social_accounts_select" on social_accounts
  for select to authenticated using (
    public.is_chairman() or business_unit_id = public.current_user_business_unit_id()
  );

-- No insert/update/delete policy for authenticated users: connecting an
-- account only ever happens through the OAuth callback route (service
-- role), and disconnecting goes through a server action that also uses
-- the service role after checking the caller's role/business unit in
-- application code — see src/lib/actions/social-accounts.ts.

-- Public bucket used only as a short-lived bridge so Instagram/TikTok's
-- servers (which fetch media from a public URL, not raw bytes we upload)
-- can reach a photo/video — see src/lib/social/temp-storage.ts, which
-- deletes each object right after the platform has fetched it. "public"
-- here only means "servable by anonymous GET at its exact random path",
-- not listable/discoverable.
insert into storage.buckets (id, name, public)
values ('social-media-temp', 'social-media-temp', true)
on conflict (id) do nothing;
