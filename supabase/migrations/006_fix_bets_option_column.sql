-- Align bets with live schema: column is `option`, not `choice`.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.bets
  add column if not exists option text;

alter table public.bets
  add column if not exists amount numeric(12, 2);

alter table public.bets
  add column if not exists shares numeric(18, 8) default 0;

alter table public.bets
  add column if not exists avg_price numeric(12, 8);

alter table public.bets
  add column if not exists created_at timestamptz default now();

-- If an older `choice` column exists, copy values into `option`
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bets' and column_name = 'choice'
  ) then
    execute $sql$
      update public.bets
      set option = coalesce(option, choice)
      where option is null and choice is not null
    $sql$;
  end if;
end $$;

-- Normalize option values
update public.bets
set option = upper(option)
where option is not null;

do $$
begin
  alter table public.bets
    drop constraint if exists bets_option_check;
  alter table public.bets
    add constraint bets_option_check check (option is null or option in ('YES', 'NO'));
exception
  when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- place_bet uses `option` (live schema)
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
  c_seed constant numeric := 100;
begin
  if v_user_id is null then
    raise exception 'UNAUTHORIZED' using errcode = 'P0001';
  end if;

  v_choice := upper(trim(p_choice));
  if v_choice not in ('YES', 'NO') then
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

  select coalesce(yes_pool, 0), coalesce(no_pool, 0)
  into v_yes, v_no
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
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
end;
$$;

revoke all on function public.place_bet(uuid, text, numeric) from public;
grant execute on function public.place_bet(uuid, text, numeric) to authenticated;
