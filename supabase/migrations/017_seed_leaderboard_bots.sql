-- Optional SQL seed for 10 Finnish leaderboard bots (50 bets each, varied ROI).
-- Prefer: node scripts/seed-leaderboard-bots.mjs
-- Run after 014 + 016. Creates auth users + profiles.

do $$
declare
  r record;
  v_id uuid;
  v_staked numeric := 5000;
  v_returned numeric;
  v_balance numeric;
begin
  for r in
    select * from (values
      ('SisuSpekulantti', 42::numeric),
      ('SaunaSähläys', 30),
      ('FyrkkaFani', 22),
      ('PerunaProfeetta', 15),
      ('KaamosKaveri', 10),
      ('VetoVeikko', 7),
      ('LaktoosiLalli', 3),
      ('MämmiMaestro', 0),
      ('RäntäRoi', -8),
      ('JäätelöJorma', -15)
    ) as t(username, roi)
  loop
    v_returned := round(v_staked * (1 + r.roi / 100), 2);
    v_balance := round(1000 + (v_returned - v_staked), 2);
    v_id := (
      select id from auth.users
      where email = 'bot.' || translate(lower(r.username), 'äöåé', 'aoae') || '@ennustamo.local'
      limit 1
    );

    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
      ) values (
        '00000000-0000-0000-0000-000000000000',
        v_id,
        'authenticated',
        'authenticated',
        'bot.' || translate(lower(r.username), 'äöåé', 'aoae') || '@ennustamo.local',
        crypt('BotSeed2026!', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', r.username, 'is_leaderboard_bot', true),
        now(),
        now()
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        v_id, v_id,
        jsonb_build_object(
          'sub', v_id::text,
          'email', 'bot.' || translate(lower(r.username), 'äöåé', 'aoae') || '@ennustamo.local'
        ),
        'email', v_id::text, now(), now(), now()
      );
    end if;

    insert into public.profiles (
      id, email, username, display_name, balance, fyrkat,
      total_staked, total_returned, total_bets, updated_at
    ) values (
      v_id,
      'bot.' || translate(lower(r.username), 'äöåé', 'aoae') || '@ennustamo.local',
      r.username,
      r.username,
      v_balance,
      v_balance,
      v_staked,
      v_returned,
      50,
      now()
    )
    on conflict (id) do update set
      username = excluded.username,
      display_name = excluded.display_name,
      balance = excluded.balance,
      fyrkat = excluded.fyrkat,
      total_staked = excluded.total_staked,
      total_returned = excluded.total_returned,
      total_bets = excluded.total_bets,
      updated_at = now();
  end loop;
end $$;
