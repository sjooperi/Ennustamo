-- Community market reports + auto-remove at threshold; refund bets on remove/disputed
-- Run after 022.

-- Allow removed status
do $$
begin
  alter table public.markets drop constraint if exists markets_status_check;
exception when others then null;
end $$;

alter table public.markets
  add constraint markets_status_check
  check (status in ('open', 'closed', 'resolved', 'cancelled', 'disputed', 'removed'));

alter table public.markets
  add column if not exists report_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- Reports table (one report per user per market)
-- ---------------------------------------------------------------------------

create table if not exists public.market_reports (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint market_reports_user_market_uidx unique (user_id, market_id)
);

create index if not exists market_reports_market_id_idx
  on public.market_reports (market_id);

alter table public.market_reports enable row level security;

drop policy if exists market_reports_select_own on public.market_reports;
create policy market_reports_select_own
  on public.market_reports for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Writes only via RPC
revoke insert, update, delete on public.market_reports from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Refund all stakes on a market (full amount back to each bettor)
-- ---------------------------------------------------------------------------

create or replace function public.refund_community_market_bets(p_market_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_total numeric := 0;
begin
  for r in
    select
      b.user_id,
      sum(coalesce(b.amount, 0)) as stake_total
    from public.bets b
    where b.market_id = p_market_id
    group by b.user_id
  loop
    if r.stake_total > 0 then
      update public.profiles
      set
        balance = coalesce(balance, fyrkat, 0) + r.stake_total,
        fyrkat = coalesce(fyrkat, balance, 0) + r.stake_total,
        updated_at = now()
      where id = r.user_id;

      v_total := v_total + r.stake_total;
    end if;
  end loop;

  return v_total;
end;
$$;

revoke all on function public.refund_community_market_bets(uuid) from public;
grant execute on function public.refund_community_market_bets(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Void market: slash creator stake + refund bettors + set status
-- ---------------------------------------------------------------------------

create or replace function public.void_community_market(
  p_market_id uuid,
  p_new_status text,
  p_reason text default null
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market public.markets;
  v_status text;
  v_refunded numeric;
begin
  if p_new_status not in ('disputed', 'removed') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_market.status, 'open'));
  if v_status in ('resolved', 'cancelled', 'disputed', 'removed') then
    return v_market;
  end if;

  -- Refund all bettors fully (market voided)
  v_refunded := public.refund_community_market_bets(p_market_id);

  -- Creator stake stays slashed (already deducted at create; do not return)
  update public.markets
  set
    status = p_new_status,
    stake_status = case
      when coalesce(stake_status, 'none') = 'held' then 'slashed'
      else stake_status
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'voided_at', now(),
      'void_reason', coalesce(nullif(trim(p_reason), ''), p_new_status),
      'bets_refunded_total', v_refunded,
      'awaiting_resolution', false
    )
  where id = p_market_id
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.void_community_market(uuid, text, text) from public;
grant execute on function public.void_community_market(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- report_community_market (authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.report_community_market(
  p_market_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_market public.markets;
  v_reason text;
  v_count integer;
  c_threshold constant integer := 5;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if length(v_reason) < 2 then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if lower(coalesce(v_market.category, '')) <> 'yhteisö' then
    raise exception 'NOT_COMMUNITY' using errcode = 'P0001';
  end if;

  if lower(coalesce(v_market.status, '')) in ('resolved', 'cancelled', 'disputed', 'removed') then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_market.created_by is not distinct from v_user then
    raise exception 'OWN_MARKET' using errcode = 'P0001';
  end if;

  begin
    insert into public.market_reports (market_id, user_id, reason)
    values (p_market_id, v_user, v_reason);
  exception
    when unique_violation then
      raise exception 'ALREADY_REPORTED' using errcode = 'P0001';
  end;

  select count(*)::integer into v_count
  from public.market_reports
  where market_id = p_market_id;

  update public.markets
  set report_count = v_count
  where id = p_market_id;

  if v_count >= c_threshold then
    perform public.void_community_market(
      p_market_id,
      'removed',
      'report_threshold:' || v_count::text
    );
    return jsonb_build_object(
      'ok', true,
      'report_count', v_count,
      'removed', true,
      'threshold', c_threshold
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'report_count', v_count,
    'removed', false,
    'threshold', c_threshold
  );
end;
$$;

revoke all on function public.report_community_market(uuid, text) from public;
grant execute on function public.report_community_market(uuid, text) to authenticated;

comment on function public.report_community_market(uuid, text) is
  'Report a Yhteisö market once per user; at 5 reports voids market, slashes stake, refunds bets.';

-- ---------------------------------------------------------------------------
-- slash_overdue: also refund all bets (was only slashing stake)
-- ---------------------------------------------------------------------------

create or replace function public.slash_overdue_community_markets()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select id
    from public.markets
    where lower(coalesce(category, '')) = 'yhteisö'
      and status in ('open', 'closed')
      and resolution_deadline is not null
      and resolution_deadline < now()
    for update
  loop
    perform public.void_community_market(
      r.id,
      'disputed',
      'resolution_deadline_missed'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.slash_overdue_community_markets() from public;
grant execute on function public.slash_overdue_community_markets() to service_role;
