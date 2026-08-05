-- Fix: "database error saving new user" on Google OAuth
-- Live profiles schema uses username/avatar_url/fyrkat; app expected email/display_name.
-- This migration aligns columns and replaces the trigger so auth.users inserts never fail.

-- ---------------------------------------------------------------------------
-- 1) Ensure table + columns exist (compatible with both schemas)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  add column if not exists balance numeric(12, 2);

alter table public.profiles
  add column if not exists fyrkat numeric(12, 2);

alter table public.profiles
  add column if not exists updated_at timestamptz default now();

-- Fill defaults for any null balances
update public.profiles
set balance = coalesce(balance, 1000)
where balance is null;

update public.profiles
set fyrkat = coalesce(fyrkat, balance, 1000)
where fyrkat is null;

alter table public.profiles
  alter column balance set default 1000;

alter table public.profiles
  alter column fyrkat set default 1000;

-- username may be NOT NULL without default → blocks Google users
do $$
begin
  alter table public.profiles alter column username drop not null;
exception
  when undefined_column then null;
  when others then null;
end $$;

-- Backfill display_name / email from username where useful
update public.profiles
set display_name = coalesce(nullif(display_name, ''), nullif(username, ''), 'pelaaja')
where display_name is null or display_name = '';

-- ---------------------------------------------------------------------------
-- 2) Robust trigger — never abort auth.users insert
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_avatar text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'user_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'pelaaja'
  );

  v_avatar := nullif(trim(new.raw_user_meta_data->>'avatar_url'), '');
  if v_avatar is null then
    v_avatar := nullif(trim(new.raw_user_meta_data->>'picture'), '');
  end if;

  insert into public.profiles (
    id,
    email,
    display_name,
    username,
    avatar_url,
    balance,
    fyrkat,
    updated_at
  )
  values (
    new.id,
    new.email,
    v_name,
    v_name,
    v_avatar,
    1000,
    1000,
    now()
  )
  on conflict (id) do update
    set
      email = coalesce(excluded.email, public.profiles.email),
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      username = coalesce(public.profiles.username, excluded.username),
      avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
      updated_at = now();

  return new;
exception
  when others then
    -- Never block signup / OAuth; client ensureProfileForUser is a fallback.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 3) Permissions + RLS (idempotent)
-- ---------------------------------------------------------------------------

grant usage on schema public to postgres, anon, authenticated, service_role;
grant select, insert, update on table public.profiles to postgres, service_role;
grant select, insert on table public.profiles to authenticated;
grant select on table public.profiles to anon;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select to anon, authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (
    auth.uid() = id
    and coalesce(balance, 1000) = 1000
  );

-- Allow users to fill missing profile fields (not balance)
drop policy if exists "profiles_update_own_meta" on public.profiles;
create policy "profiles_update_own_meta"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
