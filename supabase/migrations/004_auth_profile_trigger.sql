-- Optional hardening for Google / email auth profile creation
-- Safe to re-run. Trigger already exists in 002; this ensures Google users get a name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, balance)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, 'pelaaja'), '@', 1)
    ),
    1000
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
