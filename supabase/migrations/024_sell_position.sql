-- Early cash-out: sell shares back before market resolves
-- Run after 023.

-- Allow cash-out rows (negative amount offsets cost basis)
alter table public.bets drop constraint if exists bets_amount_check;
alter table public.bets
  add constraint bets_amount_check check (amount <> 0);

-- Don't count cash-outs toward stake / bet count (016 renamed this trigger fn)
create or replace function public.trg_bets_add_staked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.amount, 0) > 0 then
    update public.profiles
    set
      total_staked = coalesce(total_staked, 0) + coalesce(new.amount, 0),
      total_bets = coalesce(total_bets, 0) + 1,
      updated_at = now()
    where id = new.user_id;
  end if;
  return new;
end;
$$;

-- Volume: only count positive bets
create or replace function public.bump_market_volume()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.amount, 0) > 0 then
    update public.markets
    set total_volume = coalesce(total_volume, 0) + coalesce(new.amount, 0)
    where id = new.market_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- sell_position: cash out shares of one option (all or partial AMM shares)
-- Binary: exact CPMM inverse of place_bet buy.
-- Multi: sell at spot price_i = pool_i / sum(pools).
-- ---------------------------------------------------------------------------

create or replace function public.sell_position(
  p_market_id uuid,
  p_choice text,
  p_shares numeric default null  -- null = sell all held shares for this option
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_choice text;
  v_status text;
  v_end timestamptz;
  v_meta jsonb;
  v_game_start timestamptz;
  v_yes numeric;
  v_no numeric;
  v_opts jsonb;
  v_pools jsonb;
  v_keys text[];
  v_is_multi boolean;
  v_held_shares numeric;
  v_held_cost numeric;
  v_sell_shares numeric;
  v_cost_basis numeric;
  v_proceeds numeric;
  v_k numeric;
  v_u numeric;
  v_b numeric;
  v_disc numeric;
  v_new_yes numeric;
  v_new_no numeric;
  v_pool numeric;
  v_total numeric;
  v_price numeric;
  v_key text;
  v_bet public.bets;
  c_seed constant numeric := 100;
begin
  if v_user is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_choice));
  if v_choice is null or length(v_choice) = 0 then
    raise exception 'INVALID_CHOICE' using errcode = 'P0001';
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

  if v_end is not null and v_end <= now() then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
  end if;

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

  select
    coalesce(sum(coalesce(b.shares, 0)), 0),
    coalesce(sum(coalesce(b.amount, 0)), 0)
  into v_held_shares, v_held_cost
  from public.bets b
  where b.market_id = p_market_id
    and b.user_id = v_user
    and upper(coalesce(b.option, '')) = v_choice;

  if v_held_shares <= 0.0000001 then
    raise exception 'NO_POSITION' using errcode = 'P0001';
  end if;

  if p_shares is null or p_shares >= v_held_shares then
    v_sell_shares := v_held_shares;
    v_cost_basis := greatest(v_held_cost, 0);
  else
    if p_shares <= 0 then
      raise exception 'INVALID_SHARES' using errcode = 'P0001';
    end if;
    v_sell_shares := p_shares;
    v_cost_basis := round(greatest(v_held_cost, 0) * (v_sell_shares / v_held_shares), 2);
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

    -- Inverse of CPMM buy (see lib/amm quoteSell)
    if v_choice = 'YES' then
      -- u = new no pool; a = no - u
      -- u^2 + (s + yes - no)*u - k = 0
      v_b := v_sell_shares + v_yes - v_no;
      v_disc := v_b * v_b + 4 * v_k;
      if v_disc < 0 then
        raise exception 'INVALID_SHARES' using errcode = 'P0001';
      end if;
      v_u := (-v_b + sqrt(v_disc)) / 2;
      if v_u is null or v_u <= 0 or v_u >= v_no then
        raise exception 'INVALID_SHARES' using errcode = 'P0001';
      end if;
      v_proceeds := v_no - v_u;
      v_new_no := v_u;
      v_new_yes := v_k / v_new_no;
    else
      -- u = new yes pool; a = yes - u
      v_b := v_sell_shares + v_no - v_yes;
      v_disc := v_b * v_b + 4 * v_k;
      if v_disc < 0 then
        raise exception 'INVALID_SHARES' using errcode = 'P0001';
      end if;
      v_u := (-v_b + sqrt(v_disc)) / 2;
      if v_u is null or v_u <= 0 or v_u >= v_yes then
        raise exception 'INVALID_SHARES' using errcode = 'P0001';
      end if;
      v_proceeds := v_yes - v_u;
      v_new_yes := v_u;
      v_new_no := v_k / v_new_yes;
    end if;

    v_proceeds := round(v_proceeds, 2);
    if v_proceeds < 0.01 then
      raise exception 'INVALID_SHARES' using errcode = 'P0001';
    end if;

    update public.profiles
    set
      balance = coalesce(balance, fyrkat, 0) + v_proceeds,
      fyrkat = coalesce(fyrkat, balance, 0) + v_proceeds,
      total_returned = coalesce(total_returned, 0) + v_proceeds,
      updated_at = now()
    where id = v_user;

    insert into public.bets (user_id, market_id, option, amount, shares, avg_price)
    values (
      v_user,
      p_market_id,
      v_choice,
      -greatest(v_cost_basis, 0.01),
      -v_sell_shares,
      case when v_sell_shares > 0 then v_proceeds / v_sell_shares else 0 end
    )
    returning * into v_bet;

    update public.markets
    set
      yes_pool = v_new_yes,
      no_pool = v_new_no,
      option_pools = jsonb_build_object('YES', v_new_yes, 'NO', v_new_no)
    where id = p_market_id;

  else
    foreach v_key in array v_keys
    loop
      if not (v_pools ? v_key) then
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

    v_proceeds := round(v_sell_shares * v_price, 2);
    if v_proceeds < 0.01 then
      raise exception 'INVALID_SHARES' using errcode = 'P0001';
    end if;

    if v_proceeds >= v_pool then
      v_proceeds := round(v_pool * 0.99, 2);
    end if;

    v_pools := jsonb_set(v_pools, array[v_choice], to_jsonb(v_pool - v_proceeds));

    update public.profiles
    set
      balance = coalesce(balance, fyrkat, 0) + v_proceeds,
      fyrkat = coalesce(fyrkat, balance, 0) + v_proceeds,
      total_returned = coalesce(total_returned, 0) + v_proceeds,
      updated_at = now()
    where id = v_user;

    insert into public.bets (user_id, market_id, option, amount, shares, avg_price)
    values (
      v_user,
      p_market_id,
      v_choice,
      -greatest(v_cost_basis, 0.01),
      -v_sell_shares,
      case when v_sell_shares > 0 then v_proceeds / v_sell_shares else 0 end
    )
    returning * into v_bet;

    update public.markets
    set option_pools = v_pools
    where id = p_market_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'option', v_choice,
    'shares_sold', v_sell_shares,
    'proceeds', v_proceeds,
    'cost_basis', v_cost_basis,
    'profit', round(v_proceeds - v_cost_basis, 2),
    'bet_id', v_bet.id
  );
end;
$$;

revoke all on function public.sell_position(uuid, text, numeric) from public;
grant execute on function public.sell_position(uuid, text, numeric) to authenticated;

comment on function public.sell_position(uuid, text, numeric) is
  'Cash out shares before resolution; credits balance at AMM sell price.';
