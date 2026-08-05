-- Fixed Product AMM: pricing + place_bet with shares / slippage
-- Run in Supabase SQL Editor after 002_profiles_and_bets.sql

-- ---------------------------------------------------------------------------
-- Bets: store purchased shares; allow multiple buys per market
-- ---------------------------------------------------------------------------

alter table public.bets
  add column if not exists shares numeric(18, 8) not null default 0;

alter table public.bets
  add column if not exists avg_price numeric(12, 8);

-- Drop one-bet-per-user limit (Polymarket-style: buy more anytime)
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'bets_user_id_market_id_key'
      and conrelid = 'public.bets'::regclass
  ) then
    alter table public.bets drop constraint bets_user_id_market_id_key;
  end if;
end $$;

-- Seed empty pools so AMM has a starting point (50/50)
update public.markets
set yes_pool = 100,
    no_pool = 100
where coalesce(yes_pool, 0) = 0
  and coalesce(no_pool, 0) = 0;

-- ---------------------------------------------------------------------------
-- place_bet: CPMM buy, deduct balance, write bet, update pools
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
  c_seed constant numeric := 100;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  if p_choice not in ('YES', 'NO') then
    raise exception 'INVALID_CHOICE' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, email, balance)
  values (v_user_id, null, 1000)
  on conflict (id) do nothing;

  select balance into v_balance
  from public.profiles
  where id = v_user_id
  for update;

  if v_balance is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;

  if v_balance < p_amount then
    raise exception 'INSUFFICIENT_BALANCE' using errcode = 'P0001';
  end if;

  select coalesce(yes_pool, 0), coalesce(no_pool, 0)
  into v_yes, v_no
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Empty pools → 50/50 seed liquidity
  if v_yes <= 0 and v_no <= 0 then
    v_yes := c_seed;
    v_no := c_seed;
  elsif v_yes <= 0 then
    v_yes := c_seed;
  elsif v_no <= 0 then
    v_no := c_seed;
  end if;

  v_k := v_yes * v_no;

  if p_choice = 'YES' then
    -- Buy YES: add stake to NO side of the product → YES price rises
    v_new_no := v_no + p_amount;
    v_new_yes := v_k / v_new_no;
    v_shares := v_yes - v_new_yes + p_amount;
  else
    -- Buy NO: add stake to YES side → NO price rises
    v_new_yes := v_yes + p_amount;
    v_new_no := v_k / v_new_yes;
    v_shares := v_no - v_new_no + p_amount;
  end if;

  if v_shares is null or v_shares <= 0 then
    raise exception 'INVALID_SHARES' using errcode = 'P0001';
  end if;

  v_avg_price := p_amount / v_shares;

  update public.profiles
  set balance = balance - p_amount,
      updated_at = now()
  where id = v_user_id;

  insert into public.bets (user_id, market_id, choice, amount, shares, avg_price)
  values (v_user_id, p_market_id, p_choice, p_amount, v_shares, v_avg_price)
  returning * into v_bet;

  update public.markets
  set yes_pool = v_new_yes,
      no_pool = v_new_no,
      yes_votes = case
        when p_choice = 'YES' then coalesce(yes_votes, 0) + 1
        else yes_votes
      end,
      no_votes = case
        when p_choice = 'NO' then coalesce(no_votes, 0) + 1
        else no_votes
      end
  where id = p_market_id;

  return v_bet;
end;
$$;

revoke all on function public.place_bet(uuid, text, numeric) from public;
grant execute on function public.place_bet(uuid, text, numeric) to authenticated;
