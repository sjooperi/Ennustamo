-- MLB import support: external ids, subcategory, seeded pools, system resolve
-- Run after 015.

alter table public.markets
  add column if not exists external_id text;

alter table public.markets
  add column if not exists subcategory text;

alter table public.markets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists markets_external_id_uidx
  on public.markets (external_id)
  where external_id is not null;

create index if not exists markets_subcategory_idx
  on public.markets (category, subcategory)
  where subcategory is not null;

-- ---------------------------------------------------------------------------
-- create_market_system: optional seed pools + external metadata
-- ---------------------------------------------------------------------------

drop function if exists public.create_market_system(text, text[], text, timestamptz);

create or replace function public.create_market_system(
  p_title text,
  p_options text[],
  p_category text default 'Politiikka',
  p_end_date timestamptz default null,
  p_yes_seed numeric default 100,
  p_no_seed numeric default 100,
  p_external_id text default null,
  p_subcategory text default null,
  p_metadata jsonb default null
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_labels text[] := array[]::text[];
  v_label text;
  v_opts jsonb := '[]'::jsonb;
  v_pools jsonb := '{}'::jsonb;
  v_i int;
  v_key text;
  v_market public.markets;
  v_yes numeric := greatest(coalesce(p_yes_seed, 100), 1);
  v_no numeric := greatest(coalesce(p_no_seed, 100), 1);
  v_seed numeric;
begin
  if p_external_id is not null then
    select * into v_market
    from public.markets
    where external_id = trim(p_external_id)
    limit 1;
    if found then
      return v_market;
    end if;
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'INVALID_TITLE' using errcode = 'P0001';
  end if;

  if p_options is null or coalesce(array_length(p_options, 1), 0) < 2 then
    raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
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
      v_seed := case when v_i = 1 then v_yes else v_no end;
    else
      v_key := 'O' || v_i::text;
      v_seed := 100;
    end if;

    v_opts := v_opts || jsonb_build_array(
      jsonb_build_object('key', v_key, 'label', v_labels[v_i])
    );
    v_pools := v_pools || jsonb_build_object(v_key, v_seed);
  end loop;

  insert into public.markets (
    title,
    category,
    subcategory,
    end_date,
    status,
    yes_pool,
    no_pool,
    options,
    option_pools,
    external_id,
    metadata
  ) values (
    trim(p_title),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_subcategory, '')), ''),
    p_end_date,
    'open',
    case when array_length(v_labels, 1) = 2 then v_yes else 100 end,
    case when array_length(v_labels, 1) = 2 then v_no else 100 end,
    v_opts,
    v_pools,
    nullif(trim(coalesce(p_external_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.create_market_system(
  text, text[], text, timestamptz, numeric, numeric, text, text, jsonb
) from public;
grant execute on function public.create_market_system(
  text, text[], text, timestamptz, numeric, numeric, text, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- resolve_market_system: same payouts as resolve_market, service_role only
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
      'resolved_at_system', now()
    )
  where id = p_market_id;

  return v_resolution;
end;
$$;

revoke all on function public.resolve_market_system(uuid, text, text) from public;
grant execute on function public.resolve_market_system(uuid, text, text) to service_role;
