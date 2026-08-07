-- Leaderboard: track bet count + score helper
-- Score = ROI% × bets^1.04  (calibrated so 50 bets @ 30% ROI just beats 200 @ 7%)
-- Min eligibility: 50 bets

alter table public.profiles
  add column if not exists total_bets integer not null default 0;

create index if not exists profiles_total_bets_idx
  on public.profiles (total_bets desc);

-- Backfill
update public.profiles p
set total_bets = coalesce((
  select count(*)::integer
  from public.bets b
  where b.user_id = p.id
), 0);

-- Keep total_bets in sync with stakes trigger
create or replace function public.trg_bets_add_staked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    total_staked = coalesce(total_staked, 0) + coalesce(new.amount, 0),
    total_bets = coalesce(total_bets, 0) + 1,
    updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

-- Immutable score for optional SQL ordering / RPC use
create or replace function public.leaderboard_score(p_roi numeric, p_bets integer)
returns numeric
language sql
immutable
as $$
  select case
    when p_roi is null or p_bets is null or p_bets < 50 then null
    else round(p_roi * power(p_bets::numeric, 1.04), 4)
  end;
$$;

comment on function public.leaderboard_score(numeric, integer) is
  'Tulostaulukon pisteet: ROI × bets^1.04. Kalibroitu: 50@30% > 200@7% nipin napin. Min 50 vetoa.';
