-- Admin market CRUD: create / soft-delete + options jsonb
-- Run in Supabase SQL Editor after 008–010.

-- ---------------------------------------------------------------------------
-- Schema: options on markets
-- ---------------------------------------------------------------------------

alter table public.markets
  add column if not exists options jsonb;

-- Backfill binary labels for existing rows
update public.markets
set options = '[
  {"key":"YES","label":"Kyllä"},
  {"key":"NO","label":"Ei"}
]'::jsonb
where options is null;

alter table public.markets
  alter column options set default '[
    {"key":"YES","label":"Kyllä"},
    {"key":"NO","label":"Ei"}
  ]'::jsonb;

-- ---------------------------------------------------------------------------
-- admin_create_market
-- p_options: text[] of labels, min 2. Two options → YES/NO keys; more → O1,O2,…
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_market(
  p_title text,
  p_options text[],
  p_category text default null,
  p_end_date timestamptz default null
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_labels text[] := array[]::text[];
  v_label text;
  v_opts jsonb := '[]'::jsonb;
  v_i int;
  v_key text;
  v_market public.markets;
  c_seed constant numeric := 100;
begin
  if v_admin is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'INVALID_TITLE' using errcode = 'P0001';
  end if;

  if p_options is null or coalesce(array_length(p_options, 1), 0) < 2 then
    raise exception 'INVALID_OPTIONS' using errcode = 'P0001';
  end if;

  -- Trim, drop empties, dedupe while preserving order
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
  end loop;

  insert into public.markets (
    title,
    category,
    end_date,
    status,
    yes_pool,
    no_pool,
    options
  ) values (
    trim(p_title),
    nullif(trim(coalesce(p_category, '')), ''),
    p_end_date,
    'open',
    c_seed,
    c_seed,
    v_opts
  )
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.admin_create_market(text, text[], text, timestamptz) from public;
grant execute on function public.admin_create_market(text, text[], text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_delete_market: soft-delete (cancelled) so history/bets remain
-- ---------------------------------------------------------------------------

create or replace function public.admin_delete_market(p_market_id uuid)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_market public.markets;
begin
  if v_admin is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  update public.markets
  set status = 'cancelled'
  where id = p_market_id
  returning * into v_market;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_market;
end;
$$;

revoke all on function public.admin_delete_market(uuid) from public;
grant execute on function public.admin_delete_market(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_market: allow any option key from markets.options (fallback YES/NO)
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

-- Relax winning_option / payout option checks for multi-option keys (O1, O2, …)
do $$
begin
  alter table public.markets drop constraint if exists markets_winning_option_check;
exception when others then null;
end $$;

do $$
begin
  alter table public.market_resolutions drop constraint if exists market_resolutions_winning_option_check;
exception when others then null;
end $$;

do $$
begin
  alter table public.market_payouts drop constraint if exists market_payouts_option_check;
exception when others then null;
end $$;

do $$
begin
  alter table public.bets drop constraint if exists bets_option_check;
exception when others then null;
end $$;
