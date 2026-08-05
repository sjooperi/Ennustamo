-- Run in Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/isfrtoxgveskqevwkthc/sql

-- ---------------------------------------------------------------------------
-- Profiles (virtual currency)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  balance numeric(12, 2) not null default 1000 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, balance)
  values (
    new.id,
    new.email,
    split_part(coalesce(new.email, 'pelaaja'), '@', 1),
    1000
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- Allow client to create own profile if trigger hasn't run yet.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id and balance = 1000);

-- Clients must not update balance directly; use place_bet(). No UPDATE policy.

-- ---------------------------------------------------------------------------
-- Bets (one bet per user per market)
-- ---------------------------------------------------------------------------

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  choice text not null check (choice in ('YES', 'NO')),
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (user_id, market_id)
);

create index if not exists bets_user_id_idx on public.bets (user_id);
create index if not exists bets_market_id_idx on public.bets (market_id);

alter table public.bets enable row level security;

drop policy if exists "bets_select_own" on public.bets;
create policy "bets_select_own"
  on public.bets
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "bets_select_public" on public.bets;
create policy "bets_select_public"
  on public.bets
  for select
  to anon, authenticated
  using (true);

-- No direct insert/update/delete from clients — place_bet() is the only write path.

-- ---------------------------------------------------------------------------
-- Atomic place_bet (auth required, deducts balance, records bet)
-- ---------------------------------------------------------------------------

create or replace function public.place_bet(
  p_market_id uuid,
  p_choice text,
  p_amount numeric default 10
)
returns public.bets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_bet public.bets;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if p_choice not in ('YES', 'NO') then
    raise exception 'INVALID_CHOICE' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  -- Ensure profile exists (covers users created before the trigger).
  insert into public.profiles (id, email, balance)
  values (v_user_id, null, 1000)
  on conflict (id) do nothing;

  select balance into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.bets where user_id = v_user_id and market_id = p_market_id
  ) then
    raise exception 'ALREADY_BET' using errcode = 'P0001';
  end if;

  update public.profiles
  set balance = balance - p_amount,
      updated_at = now()
  where id = v_user_id;

  insert into public.bets (user_id, market_id, choice, amount)
  values (v_user_id, p_market_id, p_choice, p_amount)
  returning * into v_bet;

  if p_choice = 'YES' then
    update public.markets
    set yes_votes = coalesce(yes_votes, 0) + 1,
        yes_pool = coalesce(yes_pool, 0) + p_amount
    where id = p_market_id;
  else
    update public.markets
    set no_votes = coalesce(no_votes, 0) + 1,
        no_pool = coalesce(no_pool, 0) + p_amount
    where id = p_market_id;
  end if;

  return v_bet;
end;
$$;

revoke all on function public.place_bet(uuid, text, numeric) from public;
grant execute on function public.place_bet(uuid, text, numeric) to authenticated;

-- Prevent anonymous clients from mutating market counters.
drop policy if exists "Enable update for all users" on public.markets;
drop policy if exists "markets_update_public" on public.markets;
drop policy if exists "Allow public update" on public.markets;
