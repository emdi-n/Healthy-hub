-- Healthy Hub — one-time setup for your own Supabase project
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates two small tables: one holds your synced app data, the other
-- is an "inbox" that Health Auto Export and Shortcuts post into.

-- Your synced copy of the app (one row per person)
create table if not exists hub_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table hub_state enable row level security;
create policy "read own state" on hub_state for select using (auth.uid() = user_id);
create policy "write own state" on hub_state for insert with check (auth.uid() = user_id);
create policy "update own state" on hub_state for update using (auth.uid() = user_id);

-- Messages waiting to be read into the app (Apple Health, Shortcuts)
create table if not exists hub_inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table hub_inbox enable row level security;
create policy "read own inbox" on hub_inbox for select using (auth.uid() = user_id);
create policy "delete own inbox" on hub_inbox for delete using (auth.uid() = user_id);
-- Health Auto Export posts with your anon key, not signed in, and its JSON
-- body format is fixed by the app, so it can't put your user id inside the
-- body. Instead it sends your user id as a custom "user_id" HTTP header,
-- and this trigger reads that header and stamps it onto the row.
create or replace function hub_inbox_set_user() returns trigger as $$
begin
  new.user_id := coalesce(
    new.user_id,
    nullif(current_setting('request.headers', true)::json->>'user_id', '')::uuid,
    nullif(current_setting('request.headers', true)::json->>'User-Id', '')::uuid
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger hub_inbox_before_insert before insert on hub_inbox
for each row execute function hub_inbox_set_user();

create policy "insert to inbox with a user id header" on hub_inbox for insert with check (user_id is not null);
