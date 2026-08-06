-- Multi-option public betting: option_pools + place_bet + create seeds
-- Run after 011_admin_market_crud.sql

alter table public.markets
  add column if not exists option_pools jsonb;

-- Seed pools for every option key (binary + multi)
update public.markets m
set option_pools = (
  select coalesce(jsonb_object_agg(upper(o->>'key'), 100::numeric), '{}'::jsonb)
  from jsonb_array_elements(coalesce(m.options, '[]'::jsonb)) o
  where coalesce(o->>'key', '') <> ''
)
where option_pools is null
   or option_pools = '{}'::jsonb
   or option_pools = 'null'::jsonb;

-- ---------------------------------------------------------------------------
-- admin_create_market: also seed option_pools
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
  v_pools jsonb := '{}'::jsonb;
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

  insert into public.markets (
    title,
    category,
    end_date,
    status,
    yes_pool,
    no_pool,
    options,
    option_pools
  ) values (
    trim(p_title),
    nullif(trim(coalesce(p_category, '')), ''),
    p_end_date,
    'open',
    c_seed,
    c_seed,
    v_opts,
    v_pools
  )
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.admin_create_market(text, text[], text, timestamptz) from public;
grant execute on function public.admin_create_market(text, text[], text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- place_bet: binary CPMM (YES/NO) OR multi option_pools
-- Multi: price_i = pool_i / sum(pools); shares = amount / price_i; pool_i += amount
-- Payout remains 1 share = 1 Fyrkka on resolve.
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
  v_opts jsonb;
  v_pools jsonb;
  v_keys text[];
  v_is_multi boolean;
  v_pool numeric;
  v_total numeric;
  v_price numeric;
  v_key text;
  c_seed constant numeric := 100;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_choice));
  if v_choice is null or length(v_choice) = 0 then
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

  select
    coalesce(yes_pool, 0),
    coalesce(no_pool, 0),
    lower(coalesce(status, 'open')),
    coalesce(options, '[]'::jsonb),
    coalesce(option_pools, '{}'::jsonb)
  into v_yes, v_no, v_status, v_opts, v_pools
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
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
    raise exception 'INVALID_CHOICE' using errcode = 'P0001';
  end if;

  v_is_multi := coalesce(array_length(v_keys, 1), 0) > 2
    or not (v_keys @> array['YES','NO'] and array_length(v_keys, 1) = 2);

  if not v_is_multi then
    -- Binary CPMM
    if v_choice not in ('YES', 'NO') then
      raise exception 'INVALID_CHOICE' using errcode = 'P0001';
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
        option_pools = jsonb_build_object('YES', v_new_yes, 'NO', v_new_no),
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
  end if;

  -- Multi-option: ensure every key has a pool
  foreach v_key in array v_keys
  loop
    if v_pools ? v_key then
      null;
    else
      v_pools := v_pools || jsonb_build_object(v_key, c_seed);
    end if;
  end loop;

  v_total := 0;
  foreach v_key in array v_keys
  loop
    v_total := v_total + greatest(coalesce((v_pools->>v_key)::numeric, c_seed), 0.0001);
  end loop;

  v_pool := greatest(coalesce((v_pools->>v_choice)::numeric, c_seed), 0.0001);
  v_price := v_pool / v_total;

  if v_price is null or v_price <= 0 then
    raise exception 'INVALID_SHARES' using errcode = 'P0001';
  end if;

  -- shares so that 1 share pays 1 F; cheaper odds → more shares
  v_shares := p_amount / v_price;
  if v_shares is null or v_shares <= 0 then
    raise exception 'INVALID_SHARES' using errcode = 'P0001';
  end if;

  v_avg_price := p_amount / v_shares;
  v_pools := jsonb_set(v_pools, array[v_choice], to_jsonb(v_pool + p_amount));

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
  set option_pools = v_pools
  where id = p_market_id;

  return v_bet;
end;
$$;

revoke all on function public.place_bet(uuid, text, numeric) from public;
grant execute on function public.place_bet(uuid, text, numeric) to authenticated;
