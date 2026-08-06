-- Normalize market status casing + expire one market for admin testing.
-- Run in Supabase SQL Editor after 008_market_resolution.sql.

-- 1) OPEN → open (this was why admin list was empty)
update public.markets
set status = lower(trim(status))
where status is not null and status <> lower(trim(status));

update public.markets
set status = 'open'
where status is null or trim(status) = '';

do $$
begin
  alter table public.markets drop constraint if exists markets_status_check;
  alter table public.markets
    add constraint markets_status_check
    check (status in ('open', 'resolved', 'cancelled'));
exception when others then null;
end $$;

-- 2) Test market: mark as ended so admin shows "päättyi …"
update public.markets
set end_date = (timezone('utc', now()) - interval '1 day')
where id = 'b59e9c03-8c08-4685-a95a-9b7726e2a896'
   or title = 'Sataako Helsingissä yli 5 mm huomenna?';
