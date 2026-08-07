# Superpesis-tuonti (vedonlyöntikertoimet → Ennustamo)

## Elinkaari

| Vaihe | `status` | Mitä tapahtuu |
|-------|----------|----------------|
| Avoin veto | `open` | Listalla, veto OK kunnes ottelu alkaa |
| Odottaa ratkaisua | `closed` | Poissa avoimista; veto estetty |
| Ratkaistu | `resolved` | Voittajat saavat Fyrkkaa (1 share = 1 F) |

1. **Import** hakee ottelut [Pesistulokset](https://api.pesistulokset.fi)-API:sta (miesten Superpesis)
2. **Alkuprosentti** = OddsPortal-kirjojen keskiarvokertoimet → de-vig → fair away-% + **2 pp**, sitten **lukitaan**
3. Kohteet: `Urheilu` / `Superpesis`, `external_id` = `book:superpesis:{pesistulokset_id}`
4. **Ottelun alkaessa** (`end_date` = alkamisaika): `superpesis:odds` → `closed`
5. **Ottelun päätyttyä**: `superpesis:resolve` lukee Pesistulokset (jaksot / superpesä / kotiutuskilpailu) → payout

Jos OddsPortalilla ei ole vielä kertoimia, cron käyttää `--allow-even` (50/50 + skew). Paikallisesti ilman fallbackia: `npm run superpesis:import`.

Hallintapaneelissa: **Ratkaise urheilukohteet** (MLB + Superpesis).

## Komennot

```bash
npm run superpesis:import:dry
npm run superpesis:import
npm run superpesis:odds:dry
npm run superpesis:odds
npm run superpesis:resolve:dry
npm run superpesis:resolve
```

Valinnaisesti: `--women` tuo myös naisten Superpesiksen; `--days=3` laajentaa ikkunaa.

## Cron

**GitHub Action** `.github/workflows/superpesis-cron.yml` — joka **3 h** (UTC, :30):

1. `superpesis-import`
2. `superpesis-odds` — sulkee alkaneet
3. `superpesis-resolve` — tulos → payout

**Vercel** (`vercel.json`) päivittäinen varmistus ~07:15–08:15 UTC.
