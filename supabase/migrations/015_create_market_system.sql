-- System market create for cron / service role (no interactive admin session)
-- Run after 011–012.

create or replace function public.create_market_system(
  p_title text,
  p_options text[],
  p_category text default 'Politiikka',
  p_end_date timestamptz default null
)
returns public.markets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_labels text[] := array[]::text[];
  v_label text;
  v_opts jsonb := '[]'::jsonb;
  v_pools jsonb := '{}'::jsonb;
  v_i int;
  v_key text;
  v_market public.markets;
  c_seed constant numeric := 100;
begin
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

revoke all on function public.create_market_system(text, text[], text, timestamptz) from public;
grant execute on function public.create_market_system(text, text[], text, timestamptz) to service_role;
