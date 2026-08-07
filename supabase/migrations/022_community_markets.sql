-- Community ("Yhteisö") user-created markets: stake escrow, daily limit, resolve/slash
-- Run after 021.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.markets
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.markets
  add column if not exists resolution_criteria text;

alter table public.markets
  add column if not exists resolution_deadline timestamptz;

alter table public.markets
  add column if not exists creator_stake numeric(12, 2) not null default 0;

alter table public.markets
  add column if not exists stake_status text not null default 'none';

alter table public.markets
  add column if not exists total_volume numeric(14, 2) not null default 0;

do $$
begin
  alter table public.markets drop constraint if exists markets_stake_status_check;
exception when others then null;
end $$;

alter table public.markets
  add constraint markets_stake_status_check
  check (stake_status in ('none', 'held', 'returned', 'slashed'));

do $$
begin
  alter table public.markets drop constraint if exists markets_status_check;
exception when others then null;
end $$;

alter table public.markets
  add constraint markets_status_check
  check (status in ('open', 'closed', 'resolved', 'cancelled', 'disputed'));

create index if not exists markets_created_by_created_at_idx
  on public.markets (created_by, created_at desc);

create index if not exists markets_category_volume_idx
  on public.markets (category, total_volume desc);

create index if not exists markets_resolution_deadline_idx
  on public.markets (resolution_deadline)
  where stake_status = 'held' and status in ('open', 'closed');

-- Volume bump on every bet
create or replace function public.bump_market_volume()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.markets
  set total_volume = coalesce(total_volume, 0) + coalesce(new.amount, 0)
  where id = new.market_id;
  return new;
end;
$$;

drop trigger if exists bets_bump_market_volume on public.bets;
create trigger bets_bump_market_volume
  after insert on public.bets
  for each row
  execute function public.bump_market_volume();

-- Backfill volume from existing bets
update public.markets m
set total_volume = coalesce((
  select sum(coalesce(b.amount, 0)) from public.bets b where b.market_id = m.id
), 0);

-- ---------------------------------------------------------------------------
-- create_community_market
-- ---------------------------------------------------------------------------

create or replace function public.create_community_market(
  p_title text,
  p_options text[],
  p_end_date timestamptz,
  p_resolution_criteria text,
  p_stake numeric default 50
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_balance numeric;
  v_today_count integer;
  v_labels text[] := array[]::text[];
  v_label text;
  v_opts jsonb := '[]'::jsonb;
  v_pools jsonb := '{}'::jsonb;
  v_i int;
  v_key text;
  v_market public.markets;
  v_stake numeric := greatest(coalesce(p_stake, 50), 1);
  v_deadline timestamptz;
  c_seed constant numeric := 100;
  c_max_daily constant integer := 2;
  c_resolve_hours constant integer := 48;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'INVALID_TITLE' using errcode = 'P0001';
  end if;

  if p_end_date is null or p_end_date <= now() then
    raise exception 'INVALID_END_DATE' using errcode = 'P0001';
  end if;

  if p_resolution_criteria is null or length(trim(p_resolution_criteria)) < 5 then
    raise exception 'INVALID_CRITERIA' using errcode = 'P0001';
  end if;

  if p_options is null or coalesce(array_length(p_options, 1), 0) < 2 then
    raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
  end if;

  -- Daily limit (Europe/Helsinki calendar day)
  select count(*)::integer into v_today_count
  from public.markets
  where created_by = v_user
    and lower(coalesce(category, '')) = 'yhteisö'
    and (created_at at time zone 'Europe/Helsinki')::date
      = (now() at time zone 'Europe/Helsinki')::date
    and lower(coalesce(status, '')) <> 'cancelled';

  if v_today_count >= c_max_daily then
    raise exception 'DAILY_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, balance, fyrkat)
  values (v_user, 1000, 1000)
  on conflict (id) do nothing;

  select coalesce(balance, fyrkat, 0) into v_balance
  from public.profiles
  where id = v_user
  for update;

  if v_balance is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  if v_balance < v_stake then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  foreach v_label in array p_options
  loop
    v_label := trim(v_label);
    if length(v_label) > 0
       and not exists (
         select 1 from unnest(v_labels) x where lower(x) = lower(v_label)
       )
    then
      v_labels := array_append(v_labels, v_label);
    end if;
  end loop;

  if coalesce(array_length(v_labels, 1), 0) < 2 then
    raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
  end if;

  for v_i in 1 .. array_length(v_labels, 1)
  loop
    if array_length(v_labels, 1) = 2 then
      v_key := case when v_i = 1 then 'YES' else 'NO' end;
    else
      v_key := 'O' || v_i::text;
    end if;
    v_opts := v_opts || jsonb_build_array(
      jsonb_build_object('key', v_key, 'label', v_labels[v_i])
    );
    v_pools := v_pools || jsonb_build_object(v_key, c_seed);
  end loop;

  v_deadline := p_end_date + make_interval(hours => c_resolve_hours);

  update public.profiles
  set
    balance = coalesce(balance, fyrkat, 0) - v_stake,
    fyrkat = coalesce(fyrkat, balance, 0) - v_stake,
    updated_at = now()
  where id = v_user;

  insert into public.markets (
    title,
    category,
    end_date,
    status,
    yes_pool,
    no_pool,
    options,
    option_pools,
    created_by,
    resolution_criteria,
    resolution_deadline,
    creator_stake,
    stake_status,
    total_volume,
    metadata
  ) values (
    trim(p_title),
    'Yhteisö',
    p_end_date,
    'open',
    case when array_length(v_labels, 1) = 2 then c_seed else 100 end,
    case when array_length(v_labels, 1) = 2 then c_seed else 100 end,
    v_opts,
    v_pools,
    v_user,
    trim(p_resolution_criteria),
    v_deadline,
    v_stake,
    'held',
    0,
    jsonb_build_object(
      'community', true,
      'creator_stake', v_stake,
      'resolution_hours', c_resolve_hours
    )
  )
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.create_community_market(text, text[], timestamptz, text, numeric) from public;
grant execute on function public.create_community_market(text, text[], timestamptz, text, numeric) to authenticated;

comment on function public.create_community_market(text, text[], timestamptz, text, numeric) is
  'User-created Yhteisö market; escrows creator stake; max 2 per Helsinki calendar day.';

-- ---------------------------------------------------------------------------
-- resolve_community_market (creator): payouts + return stake
-- ---------------------------------------------------------------------------

create or replace function public.resolve_community_market(
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
  v_user uuid := auth.uid();
  v_choice text;
  v_status text;
  v_opts jsonb;
  v_keys text[];
  v_created_by uuid;
  v_deadline timestamptz;
  v_end timestamptz;
  v_stake numeric;
  v_stake_status text;
  v_resolution public.market_resolutions;
  v_total_payout numeric := 0;
  v_winner_count integer := 0;
  v_loser_count integer := 0;
  r record;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_winning_option));
  if v_choice is null or length(v_choice) = 0 then
    raise exception 'INVALID_OUTCOME' using errcode = 'P0001';
  end if;

  select
    lower(coalesce(status, 'open')),
    coalesce(options, '[]'::jsonb),
    created_by,
    resolution_deadline,
    end_date,
    coalesce(creator_stake, 0),
    coalesce(stake_status, 'none')
  into v_status, v_opts, v_created_by, v_deadline, v_end, v_stake, v_stake_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_created_by is distinct from v_user and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_status = 'resolved' then
    raise exception 'ALREADY_RESOLVED' using errcode = 'P0001';
  end if;

  if v_status in ('cancelled', 'disputed') then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  if v_end is not null and v_end > now() then
    raise exception 'TOO_EARLY' using errcode = 'P0001';
  end if;

  if v_deadline is not null and v_deadline < now() then
    raise exception 'RESOLUTION_EXPIRED' using errcode = 'P0001';
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
    p_market_id, v_choice, v_user, coalesce(p_notes, 'community_creator')
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

  if v_stake_status = 'held' and v_stake > 0 and v_created_by is not null then
    update public.profiles
    set
      balance = coalesce(balance, fyrkat, 0) + v_stake,
      fyrkat = coalesce(fyrkat, balance, 0) + v_stake,
      updated_at = now()
    where id = v_created_by;
  end if;

  update public.markets
  set
    status = 'resolved',
    winning_option = v_choice,
    resolved_at = now(),
    resolved_by = v_user,
    stake_status = case when v_stake_status = 'held' then 'returned' else v_stake_status end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'resolved_by_creator', true,
      'awaiting_resolution', false
    )
  where id = p_market_id;

  return v_resolution;
end;
$$;

revoke all on function public.resolve_community_market(uuid, text, text) from public;
grant execute on function public.resolve_community_market(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- slash_overdue_community_markets (service_role / cron)
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
      and stake_status = 'held'
      and status in ('open', 'closed')
      and resolution_deadline is not null
      and resolution_deadline < now()
    for update
  loop
    update public.markets
    set
      status = 'disputed',
      stake_status = 'slashed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'slashed_at', now(),
        'slash_reason', 'resolution_deadline_missed',
        'awaiting_resolution', false
      )
    where id = r.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.slash_overdue_community_markets() from public;
grant execute on function public.slash_overdue_community_markets() to service_role;
