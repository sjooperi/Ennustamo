-- Community creator weekly/monthly volume rewards, notifications, market wizard badge
-- Run after 025.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists badges text[] not null default '{}';

create table if not exists public.creator_reward_awards (
  id uuid primary key default gen_random_uuid(),
  period_kind text not null check (period_kind in ('week', 'month')),
  period_start date not null,
  period_end date not null,
  rank integer not null check (rank between 1 and 5),
  market_id uuid references public.markets (id) on delete set null,
  market_title text,
  user_id uuid not null references auth.users (id) on delete cascade,
  volume numeric(14, 2) not null default 0,
  reward_amount numeric(12, 2) not null default 0,
  badge_granted boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

-- Real cron awards: one winner per rank per period. Tests may repeat per admin.
create unique index if not exists creator_reward_awards_period_rank_uidx
  on public.creator_reward_awards (period_kind, period_start, rank)
  where coalesce(is_test, false) = false;

create unique index if not exists creator_reward_awards_test_period_rank_user_uidx
  on public.creator_reward_awards (period_kind, period_start, rank, user_id)
  where is_test = true;

create index if not exists creator_reward_awards_period_idx
  on public.creator_reward_awards (period_kind, period_start desc);

create index if not exists creator_reward_awards_user_idx
  on public.creator_reward_awards (user_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.creator_reward_awards enable row level security;
alter table public.notifications enable row level security;

drop policy if exists creator_reward_awards_select_public on public.creator_reward_awards;
create policy creator_reward_awards_select_public
  on public.creator_reward_awards
  for select
  to anon, authenticated
  using (true);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select on table public.creator_reward_awards to anon, authenticated;
grant select, update (read_at) on table public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.community_creator_reward_amounts(p_period_kind text)
returns numeric[]
language sql
immutable
as $$
  select case
    when p_period_kind = 'week' then array[200, 150, 100, 50, 25]::numeric[]
    when p_period_kind = 'month' then array[400, 300, 200, 100, 50]::numeric[]
    else null
  end;
$$;

create or replace function public.community_reward_period_bounds(p_period_kind text, p_now timestamptz default now())
returns table (period_start date, period_end date)
language plpgsql
stable
as $$
declare
  v_local timestamp;
  v_end date;
  v_start date;
begin
  if p_period_kind not in ('week', 'month') then
    raise exception 'INVALID_PERIOD';
  end if;

  v_local := p_now at time zone 'Europe/Helsinki';

  if p_period_kind = 'week' then
    -- ISO week: Monday start. Award previous full week.
    v_end := date_trunc('week', v_local)::date;
    v_start := v_end - 7;
  else
    v_end := date_trunc('month', v_local)::date;
    v_start := (v_end - interval '1 month')::date;
  end if;

  period_start := v_start;
  period_end := v_end;
  return next;
end;
$$;

create or replace function public._credit_profile_balance(p_user_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return;
  end if;

  update public.profiles
  set
    balance = coalesce(balance, fyrkat, 0) + p_amount,
    fyrkat = coalesce(fyrkat, balance, 0) + p_amount,
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public._grant_market_wizard_badge(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    badges = case
      when badges @> array['market_wizard']::text[] then badges
      else array_append(coalesce(badges, '{}'::text[]), 'market_wizard')
    end,
    updated_at = now()
  where id = p_user_id;
end;
$$;

create or replace function public._notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, metadata)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Award previous period's top 5 community markets by buy-volume
-- ---------------------------------------------------------------------------

create or replace function public.award_community_creator_rewards(p_period_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_rewards numeric[];
  v_existing int;
  v_awarded int := 0;
  v_total_paid numeric := 0;
  r record;
  v_amount numeric;
  v_badge boolean;
  v_period_label text;
begin
  if p_period_kind not in ('week', 'month') then
    raise exception 'INVALID_PERIOD';
  end if;

  select b.period_start, b.period_end
  into v_start, v_end
  from public.community_reward_period_bounds(p_period_kind, now()) b;

  v_start_ts := (v_start::timestamp at time zone 'Europe/Helsinki');
  v_end_ts := (v_end::timestamp at time zone 'Europe/Helsinki');
  v_rewards := public.community_creator_reward_amounts(p_period_kind);

  select count(*)::int into v_existing
  from public.creator_reward_awards
  where period_kind = p_period_kind
    and period_start = v_start
    and coalesce(is_test, false) = false;

  if v_existing > 0 then
    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'already_awarded',
      'period_kind', p_period_kind,
      'period_start', v_start,
      'period_end', v_end,
      'awarded', 0
    );
  end if;

  if p_period_kind = 'week' then
    v_period_label := to_char(v_start, 'DD.MM') || '–' || to_char(v_end - 1, 'DD.MM.YYYY');
  else
    v_period_label := to_char(v_start, 'MM/YYYY');
  end if;

  for r in
    with market_vols as (
      select
        m.id as market_id,
        m.title as market_title,
        m.created_by as user_id,
        coalesce(sum(b.amount), 0)::numeric as volume
      from public.markets m
      inner join public.bets b on b.market_id = m.id
      where m.category = 'Yhteisö'
        and m.created_by is not null
        and m.status in ('open', 'closed', 'resolved')
        and coalesce(b.amount, 0) > 0
        and b.created_at >= v_start_ts
        and b.created_at < v_end_ts
      group by m.id, m.title, m.created_by
      having coalesce(sum(b.amount), 0) > 0
    )
    select
      mv.market_id,
      mv.market_title,
      mv.user_id,
      mv.volume,
      row_number() over (order by mv.volume desc, mv.market_id) as rank
    from market_vols mv
    order by mv.volume desc, mv.market_id
    limit 5
  loop
    v_amount := v_rewards[r.rank];
    v_badge := (p_period_kind = 'month' and r.rank = 1);

    insert into public.creator_reward_awards (
      period_kind,
      period_start,
      period_end,
      rank,
      market_id,
      market_title,
      user_id,
      volume,
      reward_amount,
      badge_granted,
      is_test
    ) values (
      p_period_kind,
      v_start,
      v_end,
      r.rank::int,
      r.market_id,
      r.market_title,
      r.user_id,
      r.volume,
      v_amount,
      v_badge,
      false
    );

    perform public._credit_profile_balance(r.user_id, v_amount);

    if v_badge then
      perform public._grant_market_wizard_badge(r.user_id);
    end if;

    perform public._notify_user(
      r.user_id,
      case when p_period_kind = 'week' then 'creator_reward_week' else 'creator_reward_month' end,
      case
        when p_period_kind = 'week' then
          format('Viikon suosituin #%s — +%s F', r.rank, trim(to_char(v_amount, '999999990')))
        else
          format('Kuukauden suosituin #%s — +%s F', r.rank, trim(to_char(v_amount, '999999990')))
      end,
      case
        when v_badge then
          format(
            'Kohteesi “%s” oli kuukauden volyymikärki (%s F). Sait palkinnon %s F ja badgen Kuukauden markkinavelho.',
            coalesce(r.market_title, 'kohde'),
            trim(to_char(r.volume, '999999990.99')),
            trim(to_char(v_amount, '999999990'))
          )
        when p_period_kind = 'week' then
          format(
            'Kohteesi “%s” sijoittui viikon top 5:een (sija %s, volyymi %s F). Palkinto: %s F. Jakso %s.',
            coalesce(r.market_title, 'kohde'),
            r.rank,
            trim(to_char(r.volume, '999999990.99')),
            trim(to_char(v_amount, '999999990')),
            v_period_label
          )
        else
          format(
            'Kohteesi “%s” sijoittui kuukauden top 5:een (sija %s, volyymi %s F). Palkinto: %s F. Jakso %s.',
            coalesce(r.market_title, 'kohde'),
            r.rank,
            trim(to_char(r.volume, '999999990.99')),
            trim(to_char(v_amount, '999999990')),
            v_period_label
          )
      end,
      jsonb_build_object(
        'period_kind', p_period_kind,
        'period_start', v_start,
        'period_end', v_end,
        'rank', r.rank,
        'reward_amount', v_amount,
        'market_id', r.market_id,
        'badge_granted', v_badge
      )
    );

    v_awarded := v_awarded + 1;
    v_total_paid := v_total_paid + v_amount;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'skipped', false,
    'period_kind', p_period_kind,
    'period_start', v_start,
    'period_end', v_end,
    'awarded', v_awarded,
    'total_paid', v_total_paid
  );
end;
$$;

grant execute on function public.award_community_creator_rewards(text) to service_role;

-- ---------------------------------------------------------------------------
-- Admin: simulate winning all weekly + monthly rewards (for UI testing)
-- ---------------------------------------------------------------------------

create or replace function public.admin_test_creator_rewards()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week_start date;
  v_week_end date;
  v_month_start date;
  v_month_end date;
  v_week_rewards numeric[] := public.community_creator_reward_amounts('week');
  v_month_rewards numeric[] := public.community_creator_reward_amounts('month');
  v_total numeric := 0;
  v_amount numeric;
  i int;
  v_test_week date;
  v_test_month date;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  -- Synthetic period keys that won't collide with real cron periods.
  v_test_week := date '2099-01-06';
  v_test_month := date '2099-01-01';
  v_week_start := v_test_week;
  v_week_end := v_test_week + 7;
  v_month_start := v_test_month;
  v_month_end := (v_test_month + interval '1 month')::date;

  delete from public.creator_reward_awards
  where is_test = true
    and user_id = v_uid
    and (
      (period_kind = 'week' and period_start = v_week_start)
      or (period_kind = 'month' and period_start = v_month_start)
    );

  for i in 1..5 loop
    v_amount := v_week_rewards[i];
    v_total := v_total + v_amount;

    insert into public.creator_reward_awards (
      period_kind, period_start, period_end, rank,
      market_id, market_title, user_id, volume, reward_amount,
      badge_granted, is_test
    ) values (
      'week', v_week_start, v_week_end, i,
      null, format('Testiviikon kohde #%s', i), v_uid, (1000 - i * 100)::numeric, v_amount,
      false, true
    );

    perform public._notify_user(
      v_uid,
      'creator_reward_week',
      format('Viikon suosituin #%s — +%s F', i, trim(to_char(v_amount, '999999990'))),
      format(
        'Testipalkinto: sijoitus %s viikon top 5:ssä. Palkinto %s F.',
        i,
        trim(to_char(v_amount, '999999990'))
      ),
      jsonb_build_object(
        'period_kind', 'week',
        'period_start', v_week_start,
        'rank', i,
        'reward_amount', v_amount,
        'is_test', true
      )
    );
  end loop;

  for i in 1..5 loop
    v_amount := v_month_rewards[i];
    v_total := v_total + v_amount;

    insert into public.creator_reward_awards (
      period_kind, period_start, period_end, rank,
      market_id, market_title, user_id, volume, reward_amount,
      badge_granted, is_test
    ) values (
      'month', v_month_start, v_month_end, i,
      null, format('Testikuukauden kohde #%s', i), v_uid, (2000 - i * 150)::numeric, v_amount,
      i = 1, true
    );

    perform public._notify_user(
      v_uid,
      'creator_reward_month',
      format('Kuukauden suosituin #%s — +%s F', i, trim(to_char(v_amount, '999999990'))),
      case
        when i = 1 then
          format(
            'Testipalkinto: kuukauden #1. Palkinto %s F + badge Kuukauden markkinavelho.',
            trim(to_char(v_amount, '999999990'))
          )
        else
          format(
            'Testipalkinto: sijoitus %s kuukauden top 5:ssä. Palkinto %s F.',
            i,
            trim(to_char(v_amount, '999999990'))
          )
      end,
      jsonb_build_object(
        'period_kind', 'month',
        'period_start', v_month_start,
        'rank', i,
        'reward_amount', v_amount,
        'badge_granted', i = 1,
        'is_test', true
      )
    );
  end loop;

  perform public._credit_profile_balance(v_uid, v_total);
  perform public._grant_market_wizard_badge(v_uid);

  return jsonb_build_object(
    'ok', true,
    'credited', v_total,
    'weekly_ranks', 5,
    'monthly_ranks', 5,
    'badge', 'market_wizard'
  );
end;
$$;

grant execute on function public.admin_test_creator_rewards() to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications helpers
-- ---------------------------------------------------------------------------

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_ids is null then
    update public.notifications
    set read_at = coalesce(read_at, now())
    where user_id = v_uid
      and read_at is null;
  else
    update public.notifications
    set read_at = coalesce(read_at, now())
    where user_id = v_uid
      and id = any(p_ids)
      and read_at is null;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
