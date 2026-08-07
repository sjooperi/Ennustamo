-- Close betting at first pitch: prefer metadata.game_start over end_date.
-- Fixes MLB markets where end_date was wrongly set to estimated game end (+3.5h).

-- 1) Correct end_date on open MLB markets
update public.markets
set end_date = (metadata->>'game_start')::timestamptz
where subcategory = 'MLB'
  and status = 'open'
  and metadata ? 'game_start'
  and nullif(trim(metadata->>'game_start'), '') is not null
  and (
    end_date is null
    or end_date is distinct from (metadata->>'game_start')::timestamptz
  );

-- 2) Close markets whose first pitch has already passed
update public.markets
set
  status = 'closed',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'closed_at', now(),
    'closed_reason', 'game_started_backfill',
    'awaiting_resolution', true
  )
where subcategory = 'MLB'
  and lower(coalesce(status, 'open')) = 'open'
  and metadata ? 'game_start'
  and (metadata->>'game_start')::timestamptz <= now();

-- 3) place_bet: also reject when metadata.game_start <= now()
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
  v_end timestamptz;
  v_game_start timestamptz;
  v_meta jsonb;
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
    end_date,
    coalesce(metadata, '{}'::jsonb),
    coalesce(options, '[]'::jsonb),
    coalesce(option_pools, '{}'::jsonb)
  into v_yes, v_no, v_status, v_end, v_meta, v_opts, v_pools
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status <> 'open' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  -- MLB: first pitch in metadata closes betting even if end_date was wrong
  begin
    if v_meta ? 'game_start' and nullif(trim(v_meta->>'game_start'), '') is not null then
      v_game_start := (v_meta->>'game_start')::timestamptz;
    end if;
  exception when others then
    v_game_start := null;
  end;

  if v_game_start is not null and v_game_start <= now() then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

  -- Betting closes at end_date (should equal first pitch after sync)
  if v_end is not null and v_end <= now() then
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

comment on function public.place_bet(uuid, text, numeric) is
  'Place bet; rejects when status<>open, metadata.game_start <= now(), or end_date <= now().';
