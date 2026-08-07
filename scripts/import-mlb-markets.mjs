/**
 * Import daily MLB moneylines from Polymarket into Ennustamo.
 *
 * Opening odds = Polymarket ± 2pp, then LOCKED (no live follow).
 * end_date = scheduled first pitch → betting closes when the game starts.
 *
 *   node scripts/import-mlb-markets.mjs
 *   node scripts/import-mlb-markets.mjs --dry-run
 *   node scripts/import-mlb-markets.mjs --days=3
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  dateWindow,
  enrichGamesWithSchedule,
  fetchMlbScheduleForDates,
  fetchMlbSeriesEvents,
  parseMlbMoneylineEvent,
  POLY_SKEW,
} from './lib/mlb.mjs'

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
  return { dryRun: args.has('--dry-run'), days }
}

export async function runMlbImport(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const daysAhead = options.daysAhead ?? 2
  const allowedDates = [...dateWindow({ daysAhead })]
  const allowedSet = new Set(allowedDates)

  console.log('=== MLB import ===')
  console.log(new Date().toISOString())
  console.log(`[info] Päiväikkuna: ${allowedDates.join(', ')}`)
  console.log(`[info] Skew: +${POLY_SKEW * 100} pp vs Polymarket (lukitus; veto kiinni ottelun alkaessa)`)

  const events = []
  for (let offset = 0; offset < 300; offset += 50) {
    const batch = await fetchMlbSeriesEvents({ closed: false, limit: 50, offset })
    events.push(...batch)
    if (batch.length < 50) break
  }
  console.log(`[info] Polymarket events: ${events.length}`)

  let games = []
  for (const ev of events) {
    try {
      const g = parseMlbMoneylineEvent(ev)
      if (!g) continue
      if (!allowedSet.has(g.gameDate)) continue
      games.push(g)
    } catch (err) {
      console.warn('[warn] parse fail', err instanceof Error ? err.message : err)
    }
  }

  const schedule = await fetchMlbScheduleForDates(allowedDates)
  games = enrichGamesWithSchedule(games, schedule)
  console.log(`[info] Moneyline-ottelut ikkunassa: ${games.length}`)

  if (games.length === 0) {
    console.log('[done] ei tuotavaa')
    return { imported: 0, skipped: 0, games }
  }

  if (dryRun) {
    for (const g of games) {
      const closes = g.gameStart || g.endDate
      console.log(
        `[dry] ${g.gameDate} ${g.title} | poly ${(g.polyYes * 100).toFixed(1)}% → open ${(g.openingYes * 100).toFixed(1)}% | veto kiinni ${closes || '?'}`
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
      // Existing markets stay locked — odds only move via local bets or live sync
      console.log(`[skip] lukittu (jo olemassa): ${g.title}`)
      continue
    }

    const closesAt = g.gameStart || g.endDate
    const metadata = {
      source: 'polymarket',
      sport: 'mlb',
      polymarket_event_id: g.eventId,
      polymarket_market_id: g.marketId,
      polymarket_slug: g.slug,
      game_date: g.gameDate,
      game_start: g.gameStart || null,
      mlb_game_pk: g.mlbGamePk || null,
      away: g.away,
      home: g.home,
      poly_yes: g.polyYes,
      poly_no: g.polyNo,
      opening_yes: g.openingYes,
      skew: POLY_SKEW,
      odds_locked: true,
      odds_mode: 'locked',
      betting_closes_at_start: true,
      live: false,
    }

    const { data, error } = await supabase.rpc('create_market_system', {
      p_title: `MLB: ${g.title} (${g.gameDate})`,
      p_options: [g.away, g.home],
      p_category: 'Urheilu',
      p_end_date: closesAt,
      p_yes_seed: g.yesSeed,
      p_no_seed: g.noSeed,
      p_external_id: g.externalId,
      p_subcategory: 'MLB',
      p_metadata: metadata,
    })

    if (error) {
      console.error(`[fail] ${g.title}: ${error.message}`)
      continue
    }

    imported += 1
    existing.add(g.externalId)
    console.log(
      `[ok] ${g.gameDate} ${g.title} → ${(g.openingYes * 100).toFixed(1)}% / ${((1 - g.openingYes) * 100).toFixed(1)}% | veto kiinni ${closesAt || '?'} (id=${data?.id || '?'})`
    )
  }

  console.log(`[done] tuotu ${imported}, skip ${skipped}`)
  return { imported, skipped, games }
}

async function main() {
  loadEnvFiles()
  const { dryRun, days } = parseArgs(process.argv.slice(2))
  try {
    await runMlbImport({ dryRun, daysAhead: days })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
