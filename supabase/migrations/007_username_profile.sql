-- Username / display_name for custom nicknames
-- Safe to re-run.

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

-- Unique nicknames when set (nulls allowed for users who haven't chosen one)
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null and length(trim(username)) > 0;

-- Allow authenticated users to update profile meta, not balance/fyrkat
grant select, insert on table public.profiles to authenticated;
grant update (username, display_name, avatar_url, email, updated_at)
  on table public.profiles to authenticated;

drop policy if exists "profiles_update_own_meta" on public.profiles;
create policy "profiles_update_own_meta"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
