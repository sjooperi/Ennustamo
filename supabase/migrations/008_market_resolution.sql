-- Market resolution, virtual payouts, audit trail + rollback
-- Run in Supabase SQL Editor after previous migrations.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.markets
  add column if not exists status text;

alter table public.markets
  add column if not exists winning_option text;

alter table public.markets
  add column if not exists resolved_at timestamptz;

alter table public.markets
  add column if not exists resolved_by uuid references auth.users (id);

update public.markets
set status = 'open'
where status is null or status = '';

do $$
begin
  alter table public.markets drop constraint if exists markets_status_check;
  alter table public.markets
    add constraint markets_status_check
    check (status in ('open', 'resolved', 'cancelled'));
exception when others then null;
end $$;

do $$
begin
  alter table public.markets drop constraint if exists markets_winning_option_check;
  alter table public.markets
    add constraint markets_winning_option_check
    check (winning_option is null or winning_option in ('YES', 'NO'));
exception when others then null;
end $$;

alter table public.markets
  alter column status set default 'open';

-- One resolution event per resolve action (rollback marks it rolled_back)
create table if not exists public.market_resolutions (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  winning_option text not null check (winning_option in ('YES', 'NO')),
  resolved_by uuid not null references auth.users (id),
  resolved_at timestamptz not null default now(),
  total_payout numeric(18, 2) not null default 0,
  winner_count integer not null default 0,
  loser_count integer not null default 0,
  notes text,
  rolled_back boolean not null default false,
  rolled_back_at timestamptz,
  rolled_back_by uuid references auth.users (id)
);

create index if not exists market_resolutions_market_id_idx
  on public.market_resolutions (market_id);

create index if not exists market_resolutions_resolved_at_idx
  on public.market_resolutions (resolved_at desc);

-- Per-user payout ledger (needed for rollback)
create table if not exists public.market_payouts (
  id uuid primary key default gen_random_uuid(),
  resolution_id uuid not null references public.market_resolutions (id) on delete cascade,
  market_id uuid not null references public.markets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  option text not null check (option in ('YES', 'NO')),
  stake_total numeric(18, 2) not null default 0,
  shares_total numeric(18, 8) not null default 0,
  payout_amount numeric(18, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists market_payouts_resolution_id_idx
  on public.market_payouts (resolution_id);

create index if not exists market_payouts_user_id_idx
  on public.market_payouts (user_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.market_resolutions enable row level security;
alter table public.market_payouts enable row level security;

drop policy if exists "resolutions_select_public" on public.market_resolutions;
create policy "resolutions_select_public"
  on public.market_resolutions for select
  to anon, authenticated
  using (true);

drop policy if exists "payouts_select_own_or_admin" on public.market_payouts;
create policy "payouts_select_own_or_admin"
  on public.market_payouts for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

drop policy if exists "payouts_select_public_summary" on public.market_payouts;
create policy "payouts_select_public_summary"
  on public.market_payouts for select
  to anon, authenticated
  using (true);

grant select on table public.market_resolutions to anon, authenticated;
grant select on table public.market_payouts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- place_bet: reject resolved markets (live schema with option column)
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
  v_yes numeric;
  v_no numeric;
  v_k numeric;
  v_new_yes numeric;
  v_new_no numeric;
  v_shares numeric;
  v_avg_price numeric;
  v_bet public.bets;
  v_choice text;
  v_status text;
  c_seed constant numeric := 100;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_choice));
  if v_choice not in ('YES', 'NO') then
    raise exception 'INVALID_CHOICE' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, balance, fyrkat)
  values (v_user_id, 1000, 1000)
  on conflict (id) do nothing;

  select coalesce(balance, fyrkat, 0) into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  select coalesce(yes_pool, 0), coalesce(no_pool, 0), lower(coalesce(status, 'open'))
  into v_yes, v_no, v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_yes <= 0 and v_no <= 0 then
    v_yes := c_seed;
    v_no := c_seed;
  elsif v_yes <= 0 then
    v_yes := c_seed;
  elsif v_no <= 0 then
    v_no := c_seed;
  end if;

  v_k := v_yes * v_no;

  if v_choice = 'YES' then
    v_new_no := v_no + p_amount;
    v_new_yes := v_k / v_new_no;
    v_shares := v_yes - v_new_yes + p_amount;
  else
    v_new_yes := v_yes + p_amount;
    v_new_no := v_k / v_new_yes;
    v_shares := v_no - v_new_no + p_amount;
  end if;

  if v_shares is null or v_shares <= 0 then
    raise exception 'INVALID_SHARES' using errcode = 'P0001';
  end if;

  v_avg_price := p_amount / v_shares;

  update public.profiles
  set
    balance = coalesce(balance, fyrkat, 0) - p_amount,
    fyrkat = coalesce(fyrkat, balance, 0) - p_amount,
    updated_at = now()
  where id = v_user_id;

  insert into public.bets (user_id, market_id, option, amount, shares, avg_price)
  values (v_user_id, p_market_id, v_choice, p_amount, v_shares, v_avg_price)
  returning * into v_bet;

  update public.markets
  set yes_pool = v_new_yes,
      no_pool = v_new_no,
      yes_votes = case
        when v_choice = 'YES' then coalesce(yes_votes, 0) + 1
        else yes_votes
      end,
      no_votes = case
        when v_choice = 'NO' then coalesce(no_votes, 0) + 1
        else no_votes
      end
  where id = p_market_id;

  return v_bet;
end;
$$;

revoke all on function public.place_bet(uuid, text, numeric) from public;
grant execute on function public.place_bet(uuid, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_market: admin picks YES/NO, pays winning shares (1 share = 1 F)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_market(
  p_market_id uuid,
  p_winning_option text,
  p_notes text default null
)
returns public.market_resolutions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_choice text;
  v_status text;
  v_resolution public.market_resolutions;
  v_total_payout numeric := 0;
  v_winner_count integer := 0;
  v_loser_count integer := 0;
  r record;
begin
  if v_admin is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_winning_option));
  if v_choice not in ('YES', 'NO') then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  select lower(coalesce(status, 'open')) into v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  insert into public.market_resolutions (
    market_id, winning_option, resolved_by, notes
  ) values (
    p_market_id, v_choice, v_admin, p_notes
  )
  returning * into v_resolution;

  -- Aggregate positions per user for this market
  for r in
    select
      b.user_id,
      upper(coalesce(b.option, '')) as option,
      sum(coalesce(b.amount, 0)) as stake_total,
      sum(coalesce(b.shares, 0)) as shares_total
    from public.bets b
    where b.market_id = p_market_id
    group by b.user_id, upper(coalesce(b.option, ''))
  loop
    if r.option = v_choice then
      -- AMM shares redeem 1:1 for Fyrkkaa
      insert into public.market_payouts (
        resolution_id, market_id, user_id, option,
        stake_total, shares_total, payout_amount
      ) values (
        v_resolution.id, p_market_id, r.user_id, r.option,
        r.stake_total, r.shares_total, round(r.shares_total, 2)
      );

      update public.profiles
      set
        balance = coalesce(balance, fyrkat, 0) + round(r.shares_total, 2),
        fyrkat = coalesce(fyrkat, balance, 0) + round(r.shares_total, 2),
        updated_at = now()
      where id = r.user_id;

      v_total_payout := v_total_payout + round(r.shares_total, 2);
      v_winner_count := v_winner_count + 1;
    elsif r.option in ('YES', 'NO') then
      -- Losing stakes already deducted at bet time; log zero payout for audit
      insert into public.market_payouts (
        resolution_id, market_id, user_id, option,
        stake_total, shares_total, payout_amount
      ) values (
        v_resolution.id, p_market_id, r.user_id, r.option,
        r.stake_total, r.shares_total, 0
      );
      v_loser_count := v_loser_count + 1;
    end if;
  end loop;

  update public.market_resolutions
  set
    total_payout = v_total_payout,
    winner_count = v_winner_count,
    loser_count = v_loser_count
  where id = v_resolution.id
  returning * into v_resolution;

  update public.markets
  set
    status = 'resolved',
    winning_option = v_choice,
    resolved_at = now(),
    resolved_by = v_admin
  where id = p_market_id;

  return v_resolution;
end;
$$;

revoke all on function public.resolve_market(uuid, text, text) from public;
grant execute on function public.resolve_market(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- rollback_resolution: reverse payouts and reopen market
-- ---------------------------------------------------------------------------

create or replace function public.rollback_resolution(
  p_resolution_id uuid,
  p_notes text default null
)
returns public.market_resolutions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_resolution public.market_resolutions;
  r record;
begin
  if v_admin is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_resolution
  from public.market_resolutions
  where id = p_resolution_id
  for update;

  if not found then
    raise exception 'RESOLUTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_resolution.rolled_back then
    raise exception 'ALREADY_ROLLED_BACK' using errcode = 'P0001';
  end if;

  -- Ensure this is still the active resolution for the market
  if not exists (
    select 1 from public.markets m
    where m.id = v_resolution.market_id
      and m.status = 'resolved'
      and m.winning_option = v_resolution.winning_option
  ) then
    raise exception 'MARKET_NOT_ACTIVE_RESOLUTION' using errcode = 'P0001';
  end if;

  for r in
    select * from public.market_payouts
    where resolution_id = p_resolution_id
      and payout_amount > 0
  loop
    update public.profiles
    set
      balance = greatest(0, coalesce(balance, fyrkat, 0) - r.payout_amount),
      fyrkat = greatest(0, coalesce(fyrkat, balance, 0) - r.payout_amount),
      updated_at = now()
    where id = r.user_id;
  end loop;

  update public.market_resolutions
  set
    rolled_back = true,
    rolled_back_at = now(),
    rolled_back_by = v_admin,
    notes = case
      when p_notes is null or p_notes = '' then notes
      when notes is null or notes = '' then p_notes
      else notes || E'\n[rollback] ' || p_notes
    end
  where id = p_resolution_id
  returning * into v_resolution;

  update public.markets
  set
    status = 'open',
    winning_option = null,
    resolved_at = null,
    resolved_by = null
  where id = v_resolution.market_id;

  return v_resolution;
end;
$$;

revoke all on function public.rollback_resolution(uuid, text) from public;
grant execute on function public.rollback_resolution(uuid, text) to authenticated;

-- Convenience: promote yourself once from SQL with:
-- update public.profiles set is_admin = true where email = 'you@example.com';
