# MLB-tuonti (Polymarket → Ennustamo)

## Elinkaari

| Vaihe | `status` | Mitä tapahtuu |
|-------|----------|----------------|
| Avoin veto | `open` | Listalla, veto OK kunnes ottelu alkaa |
| Odottaa ratkaisua | `closed` | Poissa avoimista; veto estetty |
| Ratkaistu | `resolved` | Voittajat saavat Fyrkkaa (1 share = 1 F) |

1. **Import** hakee Polymarketista MLB-moneylinet (`series_id=3`)
2. Kohteet: `Urheilu` / `MLB`, päiväryhmitys UI:ssa
3. **Alkuprosentti** = Polymarket **+ 3 pp** (ensimmäinen joukkue), sitten **lukitaan**
   — ei seurata Polymarketia live; vain paikalliset vedot liikuttavat hintaa
4. **Ottelun alkaessa** (`end_date` = first pitch): `mlb:odds` → `closed`
5. **Ottelun päätyttyä**: `mlb:resolve` lukee MLB Stats API (+ Polymarket fallback) → `resolve_market_system` maksaa potit

Hallintapaneelissa: **Ratkaise urheilukohteet** (ajaa close + resolve heti).

## Komennot

```bash
npm run mlb:import:dry
npm run mlb:import
npm run mlb:odds:dry      # sulkee alkaneet → closed
npm run mlb:odds
npm run mlb:resolve:dry
npm run mlb:resolve       # Final → payout
```

## Cron

Ei jatkuvaa live-seurantaa. Riittää, että uudet kohteet ilmestyvät ja
vedot ratkeavat **kohtuullisen ajan** kuluessa (tyypillisesti muutaman tunnin sisällä).

**GitHub Action** `.github/workflows/mlb-cron.yml` — joka **3 h** (UTC):

1. `mlb-import` — uudet Polymarket-moneylinet
2. `mlb-odds` — sulkee alkaneet ottelut (`closed`)
3. `mlb-resolve` — Final-tulos → payout

Aseta repo-secreetit `CRON_SECRET` ja `VERCEL_APP_URL`.

**Vercel Hobby** (kertapäivä-varmistus `vercel.json`):

- Import: 07:00 UTC
- Close-at-start: 07:30 UTC
- Resolve: 08:00 UTC

## Migraatiot (Supabase SQL)

Aja järjestyksessä:

1. `018_mlb_markets.sql`
2. `019_close_betting_at_end_date.sql` — `place_bet` hylkää jos `end_date <= now()`
3. `020_market_closed_awaiting_resolution.sql` — status `closed`, `close_market_system`
4. `021_close_at_game_start.sql` — korjaa `end_date` = first pitch, sulkee alkaneet, `place_bet` kunnioittaa `metadata.game_start`
