-- Track total staked / returned for ROI leaderboard
-- ROI = ((total_returned - total_staked) / total_staked) * 100
-- Run after 008+ (bets, market_payouts, market_resolutions exist).

alter table public.profiles
  add column if not exists total_staked numeric(18, 2) not null default 0;

alter table public.profiles
  add column if not exists total_returned numeric(18, 2) not null default 0;

-- Generated ROI % (null when no stakes yet)
do $$
begin
  alter table public.profiles drop column if exists roi_pct;
exception when others then null;
end $$;

alter table public.profiles
  add column roi_pct numeric(12, 2)
  generated always as (
    case
      when total_staked > 0 then
        round(((total_returned - total_staked) / total_staked) * 100, 2)
      else null
    end
  ) stored;

create index if not exists profiles_roi_pct_idx
  on public.profiles (roi_pct desc nulls last);

-- ---------------------------------------------------------------------------
-- Backfill from existing bets / active payouts
-- ---------------------------------------------------------------------------

update public.profiles p
set total_staked = coalesce((
  select sum(b.amount)::numeric
  from public.bets b
  where b.user_id = p.id
), 0);

update public.profiles p
set total_returned = coalesce((
  select sum(mp.payout_amount)::numeric
  from public.market_payouts mp
  join public.market_resolutions mr on mr.id = mp.resolution_id
  where mp.user_id = p.id
    and coalesce(mr.rolled_back, false) = false
), 0);

-- ---------------------------------------------------------------------------
-- Triggers: keep counters in sync
-- ---------------------------------------------------------------------------

create or replace function public.trg_bets_add_staked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    total_staked = coalesce(total_staked, 0) + coalesce(new.amount, 0),
    updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists bets_add_staked on public.bets;
create trigger bets_add_staked
  after insert on public.bets
  for each row
  execute function public.trg_bets_add_staked();

create or replace function public.trg_payouts_add_returned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.payout_amount, 0) <> 0 then
    update public.profiles
    set
      total_returned = coalesce(total_returned, 0) + new.payout_amount,
      updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists payouts_add_returned on public.market_payouts;
create trigger payouts_add_returned
  after insert on public.market_payouts
  for each row
  execute function public.trg_payouts_add_returned();

create or replace function public.trg_resolution_rollback_returned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if new.rolled_back and not coalesce(old.rolled_back, false) then
    for r in
      select user_id, sum(payout_amount) as paid
      from public.market_payouts
      where resolution_id = new.id
        and payout_amount > 0
      group by user_id
    loop
      update public.profiles
      set
        total_returned = greatest(0, coalesce(total_returned, 0) - r.paid),
        updated_at = now()
      where id = r.user_id;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists resolution_rollback_returned on public.market_resolutions;
create trigger resolution_rollback_returned
  after update of rolled_back on public.market_resolutions
  for each row
  execute function public.trg_resolution_rollback_returned();
