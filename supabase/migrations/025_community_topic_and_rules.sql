-- Community markets: topic category, optional criteria, max 8 options, 24h resolve
-- Run after 024.

alter table public.markets
  add column if not exists topic_category text;

create index if not exists markets_topic_category_idx
  on public.markets (topic_category)
  where topic_category is not null;

-- Replace create_community_market (new params + rules)
drop function if exists public.create_community_market(text, text[], timestamptz, text, numeric);

create or replace function public.create_community_market(
  p_title text,
  p_options text[],
  p_end_date timestamptz,
  p_resolution_criteria text default null,
  p_stake numeric default 50,
  p_topic_category text default null
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
  v_topic text;
  v_criteria text;
  c_seed constant numeric := 100;
  c_max_daily constant integer := 2;
  c_max_options constant integer := 8;
  c_resolve_hours constant integer := 24;
  c_topics constant text[] := array[
    'Politiikka', 'Talous', 'Urheilu', 'Viihde', 'Teknologia'
  ];
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

  v_topic := nullif(trim(coalesce(p_topic_category, '')), '');
  if v_topic is null then
    raise exception 'INVALID_TOPIC' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from unnest(c_topics) t where lower(t) = lower(v_topic)
  ) then
    raise exception 'INVALID_TOPIC' using errcode = 'P0001';
  end if;

  -- Canonical casing from allow-list
  select t into v_topic
  from unnest(c_topics) t
  where lower(t) = lower(v_topic)
  limit 1;

  -- Optional resolution criteria
  v_criteria := nullif(trim(coalesce(p_resolution_criteria, '')), '');

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

  if array_length(v_labels, 1) > c_max_options then
    raise exception 'TOO_MANY_OPTIONS' using errcode = 'P0001';
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
    topic_category,
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
    v_topic,
    p_end_date,
    'open',
    case when array_length(v_labels, 1) = 2 then c_seed else 100 end,
    case when array_length(v_labels, 1) = 2 then c_seed else 100 end,
    v_opts,
    v_pools,
    v_user,
    v_criteria,
    v_deadline,
    v_stake,
    'held',
    0,
    jsonb_build_object(
      'community', true,
      'creator_stake', v_stake,
      'resolution_hours', c_resolve_hours,
      'topic_category', v_topic
    )
  )
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.create_community_market(text, text[], timestamptz, text, numeric, text) from public;
grant execute on function public.create_community_market(text, text[], timestamptz, text, numeric, text) to authenticated;

comment on function public.create_community_market(text, text[], timestamptz, text, numeric, text) is
  'User-created Yhteisö market with topic_category; optional criteria; max 8 options; 24h resolve window; escrow stake.';
