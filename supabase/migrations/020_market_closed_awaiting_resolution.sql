-- MLB lifecycle: open → closed (awaiting result) → resolved (payouts)
-- Run after 018–019.

-- Allow closed status
do $$
begin
  alter table public.markets drop constraint if exists markets_status_check;
exception when others then null;
end $$;

alter table public.markets
  add constraint markets_status_check
  check (status in ('open', 'closed', 'resolved', 'cancelled'));

-- System resolves may leave resolved_by null
alter table public.market_resolutions
  alter column resolved_by drop not null;

-- ---------------------------------------------------------------------------
-- close_market_system: move open → closed (betting ended, await result)
-- ---------------------------------------------------------------------------

create or replace function public.close_market_system(
  p_market_id uuid,
  p_notes text default null
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market public.markets;
  v_status text;
begin
  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_market.status, 'open'));
  if v_status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;
  if v_status = 'cancelled' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;
  if v_status = 'closed' then
    return v_market;
  end if;

  update public.markets
  set
    status = 'closed',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'closed_at', now(),
      'closed_reason', coalesce(nullif(trim(p_notes), ''), 'game_started'),
      'awaiting_resolution', true
    )
  where id = p_market_id
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.close_market_system(uuid, text) from public;
grant execute on function public.close_market_system(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- resolve_market_system: allow resolving from closed (or open)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_market_system(
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
  v_choice text;
  v_status text;
  v_opts jsonb;
  v_keys text[];
  v_resolution public.market_resolutions;
  v_total_payout numeric := 0;
  v_winner_count integer := 0;
  v_loser_count integer := 0;
  r record;
begin
  v_choice := upper(trim(p_winning_option));
  if v_choice is null or length(v_choice) = 0 then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  select lower(coalesce(status, 'open')), coalesce(options, '[]'::jsonb)
  into v_status, v_opts
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  if v_status = 'cancelled' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  -- open or closed are resolvable
  if v_status not in ('open', 'closed') then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(upper(o->>'key')), array['YES','NO']::text[])
  into v_keys
  from jsonb_array_elements(v_opts) o
  where coalesce(o->>'key', '') <> '';

  if v_keys is null or array_length(v_keys, 1) is null then
    v_keys := array['YES', 'NO'];
  end if;

  if not (v_choice = any (v_keys)) then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  insert into public.market_resolutions (
    market_id, winning_option, resolved_by, notes
  ) values (
    p_market_id, v_choice, null, coalesce(p_notes, 'system')
  )
  returning * into v_resolution;

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
    elsif r.option = any (v_keys) then
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
    resolved_by = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'resolved_by_system', true,
      'resolved_at_system', now(),
      'awaiting_resolution', false
    )
  where id = p_market_id;

  return v_resolution;
end;
$$;

revoke all on function public.resolve_market_system(uuid, text, text) from public;
grant execute on function public.resolve_market_system(uuid, text, text) to service_role;

-- Admin resolve_market: also allow closed → resolved
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
  v_opts jsonb;
  v_keys text[];
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
  if v_choice is null or length(v_choice) = 0 then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  select lower(coalesce(status, 'open')), coalesce(options, '[]'::jsonb)
  into v_status, v_opts
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  if v_status = 'cancelled' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_status not in ('open', 'closed') then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(upper(o->>'key')), array['YES','NO']::text[])
  into v_keys
  from jsonb_array_elements(v_opts) o
  where coalesce(o->>'key', '') <> '';

  if v_keys is null or array_length(v_keys, 1) is null then
    v_keys := array['YES', 'NO'];
  end if;

  if not (v_choice = any (v_keys)) then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  insert into public.market_resolutions (
    market_id, winning_option, resolved_by, notes
  ) values (
    p_market_id, v_choice, v_admin, p_notes
  )
  returning * into v_resolution;

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
    elsif r.option = any (v_keys) then
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
