/**
 * Import Superpesis moneylines into Ennustamo.
 *
 * Ottelut: Pesistulokset API
 * Alkuprosentti: OddsPortal-kirjojen keskiarvo (de-vig) + BOOK_SKEW, lukitaan
 * end_date = ottelun alku → veto kiinni alkaessa
 *
 *   node scripts/import-superpesis-markets.mjs
 *   node scripts/import-superpesis-markets.mjs --dry-run
 *   node scripts/import-superpesis-markets.mjs --days=3
 *   node scripts/import-superpesis-markets.mjs --allow-even   # 50/50 jos ei kertoimia
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  BOOK_SKEW,
  SEASON_SERIES_MEN,
  SEASON_SERIES_WOMEN,
  buildSuperpesisGames,
  dateWindow,
  fairAwayProbFromDecimal,
  fetchOddsPortalSuperpesisOdds,
  fetchPesistuloksetMatches,
  poolsFromYesProb,
  skewedOpeningProb,
  teamName,
  teamsMatch,
} from './lib/superpesis.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvFiles() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name)
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const i = trimmed.indexOf('=')
      if (i < 0) continue
      const key = trimmed.slice(0, i).trim()
      let val = trimmed.slice(i + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    }
  }
}

function parseArgs(argv) {
  const args = new Set(argv)
  let days = 2
  for (const a of argv) {
    if (a.startsWith('--days=')) days = Math.max(0, Number(a.slice(7)) || 2)
  }
  return {
    dryRun: args.has('--dry-run'),
    days,
    allowEven: args.has('--allow-even'),
    includeWomen: args.has('--women'),
  }
}

function helsinkiDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/**
 * Build games from Pesistulokset schedule, attaching OddsPortal odds when found.
 */
async function collectGames({ daysAhead, allowEven, includeWomen }) {
  const allowed = new Set(dateWindow({ daysAhead }))
  const seriesIds = includeWomen
    ? [SEASON_SERIES_MEN, SEASON_SERIES_WOMEN]
    : [SEASON_SERIES_MEN]

  let portalEvents = []
  let oddsById = new Map()
  try {
    const portal = await fetchOddsPortalSuperpesisOdds()
    portalEvents = portal.events
    oddsById = portal.oddsById
    console.log(
      `[info] OddsPortal: ${portalEvents.length} tapahtumaa, ${oddsById.size} kerroinriviä`
    )
  } catch (err) {
    console.warn(
      '[warn] OddsPortal-kertoimet epäonnistuivat:',
      err instanceof Error ? err.message : err
    )
  }

  const games = []
  for (const ss of seriesIds) {
    const { matches, teams } = await fetchPesistuloksetMatches(ss)
    for (const m of matches) {
      if (m.canceled || m.invalidated) continue
      const gameStart = m.date
      const gameDate = helsinkiDate(gameStart)
      if (!allowed.has(gameDate)) continue
      if (Date.parse(gameStart) <= Date.now()) continue
      if (m.live || m.result) continue

      const home = teamName(teams, m.home)
      const away = teamName(teams, m.away)

      // Match OddsPortal event by teams + day
      let odds = null
      let portalEventId = null
      for (const ev of portalEvents) {
        const evDay = helsinkiDate(ev.startIso)
        if (evDay !== gameDate) continue
        if (!teamsMatch(ev.home, home) || !teamsMatch(ev.away, away)) continue
        portalEventId = ev.id
        odds = oddsById.get(ev.id) || null
        break
      }
      // Also try odds keys directly against finished+upcoming portal list
      if (!odds) {
        for (const [id, o] of oddsById) {
          const ev = portalEvents.find((e) => e.id === id)
          if (!ev) continue
          if (helsinkiDate(ev.startIso) !== gameDate) continue
          if (teamsMatch(ev.home, home) && teamsMatch(ev.away, away)) {
            odds = o
            portalEventId = id
            break
          }
        }
      }

      let fairAway = odds
        ? fairAwayProbFromDecimal(odds.home, odds.away, odds.draw)
        : null
      if (fairAway == null) {
        if (!allowEven) {
          console.log(`[skip] ei kertoimia: ${away} vs ${home} (${gameDate})`)
          continue
        }
        fairAway = 0.5
      }

      const openingYes = skewedOpeningProb(fairAway)
      const pools = poolsFromYesProb(openingYes)

      games.push({
        externalId: `book:superpesis:${m.id}`,
        title: `${away} vs ${home}`,
        away,
        home,
        gameDate,
        gameStart,
        endDate: gameStart,
        series: ss === SEASON_SERIES_WOMEN ? 'naiset' : 'miehet',
        seasonSeriesId: ss,
        pesistuloksetId: m.id,
        portalEventId,
        bookHome: odds?.home ?? null,
        bookDraw: odds?.draw ?? null,
        bookAway: odds?.away ?? null,
        fairAway,
        openingYes: pools.openingYesProb,
        yesSeed: pools.yesSeed,
        noSeed: pools.noSeed,
        oddsFallback: !odds,
      })
    }
  }

  // Prefer portal-built list if it found odds for games we missed
  try {
    const fromPortal = await buildSuperpesisGames({
      daysAhead,
      seasonSeriesIds: seriesIds,
    })
    const have = new Set(games.map((g) => g.externalId))
    for (const g of fromPortal) {
      if (!have.has(g.externalId)) games.push(g)
    }
  } catch {
    /* already logged upstream */
  }

  return games
}

export async function runSuperpesisImport(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const daysAhead = options.daysAhead ?? 2
  const allowEven = Boolean(options.allowEven)
  const includeWomen = Boolean(options.includeWomen)

  console.log('=== Superpesis import ===')
  console.log(new Date().toISOString())
  console.log(`[info] Päiväikkuna: ${dateWindow({ daysAhead }).join(', ')}`)
  console.log(
    `[info] Kertoimet: OddsPortal avg (de-vig) + ${BOOK_SKEW * 100} pp; veto kiinni ottelun alkaessa`
  )
  if (allowEven) console.log('[info] --allow-even: 50/50 jos kertoimia ei löydy')

  const games = await collectGames({ daysAhead, allowEven, includeWomen })
  console.log(`[info] Tuotavia otteluita: ${games.length}`)

  if (games.length === 0) {
    console.log('[done] tuotu 0, skip 0')
    return { imported: 0, skipped: 0, games }
  }

  if (dryRun) {
    for (const g of games) {
      const src = g.oddsFallback
        ? 'EVEN'
        : `book ${g.bookAway}/${g.bookHome}`
      console.log(
        `[dry] ${g.gameDate} ${g.title} | ${src} → open ${(g.openingYes * 100).toFixed(1)}% | veto kiinni ${g.gameStart}`
      )
    }
    return { imported: 0, skipped: games.length, games }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL puuttuu')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existingRows } = await supabase
    .from('markets')
    .select('external_id')
    .in(
      'external_id',
      games.map((g) => g.externalId)
    )

  const existing = new Set((existingRows || []).map((r) => r.external_id))

  let imported = 0
  let skipped = 0

  for (const g of games) {
    if (existing.has(g.externalId)) {
      skipped += 1
      console.log(`[skip] lukittu (jo olemassa): ${g.title}`)
      continue
    }

    const metadata = {
      source: 'oddsportal',
      sport: 'superpesis',
      series: g.series,
      season_series_id: g.seasonSeriesId,
      pesistulokset_id: g.pesistuloksetId,
      portal_event_id: g.portalEventId,
      game_date: g.gameDate,
      game_start: g.gameStart,
      away: g.away,
      home: g.home,
      book_home: g.bookHome,
      book_draw: g.bookDraw,
      book_away: g.bookAway,
      fair_away: g.fairAway,
      opening_yes: g.openingYes,
      skew: BOOK_SKEW,
      odds_locked: true,
      odds_mode: 'locked',
      odds_fallback: Boolean(g.oddsFallback),
      betting_closes_at_start: true,
      live: false,
    }

    const { data, error } = await supabase.rpc('create_market_system', {
      p_title: `Superpesis: ${g.title}`,
      p_options: [g.away, g.home],
      p_category: 'Urheilu',
      p_end_date: g.gameStart,
      p_yes_seed: g.yesSeed,
      p_no_seed: g.noSeed,
      p_external_id: g.externalId,
      p_subcategory: 'Superpesis',
      p_metadata: metadata,
    })

    if (error) {
      console.error(`[fail] ${g.title}: ${error.message}`)
      continue
    }

    imported += 1
    existing.add(g.externalId)
    console.log(
      `[ok] ${g.gameDate} ${g.title} → ${(g.openingYes * 100).toFixed(1)}% / ${((1 - g.openingYes) * 100).toFixed(1)}% | veto kiinni ${g.gameStart} (id=${data?.id || '?'})`
    )
  }

  console.log(`[done] tuotu ${imported}, skip ${skipped}`)
  return { imported, skipped, games }
}

async function main() {
  loadEnvFiles()
  const { dryRun, days, allowEven, includeWomen } = parseArgs(process.argv.slice(2))
  try {
    await runSuperpesisImport({
      dryRun,
      daysAhead: days,
      allowEven,
      includeWomen,
    })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
