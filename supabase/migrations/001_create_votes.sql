-- Run this in Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/isfrtoxgveskqevwkthc/sql

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets (id) on delete cascade,
  device_id text not null,
  choice text not null check (choice in ('YES', 'NO')),
  created_at timestamptz not null default now(),
  unique (market_id, device_id)
);

create index if not exists votes_market_id_idx on public.votes (market_id);
create index if not exists votes_device_id_idx on public.votes (device_id);

create or replace function public.increment_market_vote_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.choice = 'YES' then
    update public.markets
    set yes_votes = yes_votes + 1
    where id = new.market_id;
  else
    update public.markets
    set no_votes = no_votes + 1
    where id = new.market_id;
  end if;

  return new;
end;
$$;

drop trigger if exists votes_increment_market_counts on public.votes;

create trigger votes_increment_market_counts
after insert on public.votes
for each row
execute function public.increment_market_vote_count();

alter table public.votes enable row level security;

drop policy if exists "votes_select_public" on public.votes;
create policy "votes_select_public"
  on public.votes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "votes_insert_public" on public.votes;
create policy "votes_insert_public"
  on public.votes
  for insert
  to anon, authenticated
  with check (true);

-- Prevent clients from directly bumping vote counters on markets.
drop policy if exists "Enable update for all users" on public.markets;
drop policy if exists "markets_update_public" on public.markets;
drop policy if exists "Allow public update" on public.markets;
