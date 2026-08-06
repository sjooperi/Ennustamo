-- Enable Supabase Realtime for live market list updates (resolve/rollback/bets).
-- Run in Supabase SQL Editor (Dashboard → SQL).

do $$
begin
  alter publication supabase_realtime add table public.markets;
exception
  when duplicate_object then null;
  when others then
    -- Already added or publication missing in local envs
    null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.bets;
exception
  when duplicate_object then null;
  when others then null;
end $$;

-- Full row on UPDATE so clients receive status / pool changes
alter table public.markets replica identity full;
alter table public.bets replica identity full;
