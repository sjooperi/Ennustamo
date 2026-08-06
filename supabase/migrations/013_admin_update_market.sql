-- Admin update market (edit without delete)
-- Run after 011 + 012.

create or replace function public.admin_update_market(
  p_market_id uuid,
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
  v_market public.markets;
  v_status text;
  v_labels text[] := array[]::text[];
  v_label text;
  v_opts jsonb := '[]'::jsonb;
  v_pools jsonb;
  v_old_opts jsonb;
  v_old_keys text[];
  v_i int;
  v_key text;
  v_bet_count integer;
  v_old_len integer;
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

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'MARKET_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_market.status, 'open'));
  if v_status <> 'open' then
    raise exception 'MARKET_CLOSED' using errcode = 'P0001';
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

  select count(*)::integer into v_bet_count
  from public.bets
  where market_id = p_market_id;

  v_old_opts := coalesce(v_market.options, '[]'::jsonb);
  select coalesce(array_agg(upper(o->>'key')), array[]::text[])
  into v_old_keys
  from jsonb_array_elements(v_old_opts) o
  where coalesce(o->>'key', '') <> '';

  v_old_len := coalesce(array_length(v_old_keys, 1), 0);

  -- With existing bets: keep keys, only rename labels (same option count)
  if v_bet_count > 0 then
    if array_length(v_labels, 1) <> v_old_len then
      raise exception 'OPTIONS_LOCKED' using errcode = 'P0001';
    end if;

    for v_i in 1 .. array_length(v_labels, 1)
    loop
      v_key := v_old_keys[v_i];
      v_opts := v_opts || jsonb_build_array(
        jsonb_build_object('key', v_key, 'label', v_labels[v_i])
      );
    end loop;

    update public.markets
    set
      title = trim(p_title),
      category = nullif(trim(coalesce(p_category, '')), ''),
      end_date = p_end_date,
      options = v_opts
    where id = p_market_id
    returning * into v_market;

    return v_market;
  end if;

  -- No bets: rebuild options + pools freely
  v_pools := '{}'::jsonb;
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

  update public.markets
  set
    title = trim(p_title),
    category = nullif(trim(coalesce(p_category, '')), ''),
    end_date = p_end_date,
    options = v_opts,
    option_pools = v_pools,
    yes_pool = c_seed,
    no_pool = c_seed
  where id = p_market_id
  returning * into v_market;

  return v_market;
end;
$$;

revoke all on function public.admin_update_market(uuid, text, text[], text, timestamptz) from public;
grant execute on function public.admin_update_market(uuid, text, text[], text, timestamptz) to authenticated;
