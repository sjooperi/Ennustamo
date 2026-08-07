/**
 * Auto-resolve closed MLB markets after the game ends.
 * Sources: MLB Stats API (primary) + Polymarket (fallback).
 * Pays winners via resolve_market_system (1 share = 1 Fyrkka).
 *
 *   node scripts/resolve-mlb-markets.mjs
 *   node scripts/resolve-mlb-markets.mjs --dry-run
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  fetchJson,
  fetchMlbFinalsForDate,
  fetchMlbScheduleForDates,
  findScheduleGame,
  GAMMA,
  isMlbFinalStatus,
  matchMlbWinner,
  optionKeyForTeam,
  pickMoneylineMarket,
  winnerFromPolyPrices,
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

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

async function resolveFromPolymarket(meta) {
  const eventId = meta?.polymarket_event_id
  if (!eventId) return null
  const event = await fetchJson(`${GAMMA}/events/${eventId}`)
  const market = pickMoneylineMarket(event) || (event?.markets || [])[0]
  if (!market) return null
  if (!market.closed && String(market.umaResolutionStatus || '').toLowerCase() !== 'resolved') {
    if (!event.closed) return null
  }
  const win = winnerFromPolyPrices(market.outcomes, market.outcomePrices)
  if (!win) return null
  return win
}

async function resolveFromMlbStats(meta, scheduleGames) {
  const gameDate = meta?.game_date
  const away = meta?.away
  const home = meta?.home
  if (!gameDate || !away || !home) return null

  const sched = findScheduleGame(scheduleGames || [], { gameDate, away, home })
  if (
    sched &&
    (sched.final || isMlbFinalStatus(sched.status)) &&
    sched.awayScore != null &&
    sched.homeScore != null &&
    sched.awayScore !== sched.homeScore
  ) {
    const winnerName = sched.awayScore > sched.homeScore ? sched.away : sched.home
    const matched = matchMlbWinner(away, home, [{ ...sched, winner: winnerName }])
    if (matched) return matched
  }

  const finals = await fetchMlbFinalsForDate(gameDate)
  return matchMlbWinner(away, home, finals)
}

export async function runMlbResolve(options = {}) {
  const dryRun = Boolean(options.dryRun)
  console.log('=== MLB resolve + payouts ===')
  console.log(new Date().toISOString())

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL puuttuu')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Prefer closed (awaiting result); also open past end_date as safety net
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, title, options, metadata, external_id, status, end_date, subcategory')
    .eq('subcategory', 'MLB')
    .in('status', ['closed', 'open'])
    .not('external_id', 'is', null)

  if (error) throw new Error(error.message)

  const now = Date.now()
  const rows = (markets || []).filter((row) => {
    const status = String(row.status || '').toLowerCase()
    if (status === 'closed') return true
    if (status !== 'open') return false
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    const startIso = meta.game_start || row.end_date
    if (startIso && new Date(startIso).getTime() <= now) return true
    return false
  })

  console.log(`[info] Ratkaistavia / odottavia MLB-kohteita: ${rows.length}`)

  const dates = [
    ...new Set(
      rows
        .map((r) =>
          r.metadata && typeof r.metadata === 'object' ? r.metadata.game_date : null
        )
        .filter(Boolean)
    ),
  ]
  const schedule = await fetchMlbScheduleForDates(dates)

  let resolved = 0
  let pending = 0
  let failed = 0
  let closedFirst = 0

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    const options = parseOptions(row.options)
    const status = String(row.status || '').toLowerCase()

    // Ensure closed before resolve if still open but past start
    if (status === 'open' && !dryRun) {
      const { error: closeErr } = await supabase.rpc('close_market_system', {
        p_market_id: row.id,
        p_notes: 'game_started_before_resolve',
      })
      if (!closeErr) closedFirst += 1
    }

    const sched = findScheduleGame(schedule, {
      gameDate: meta.game_date,
      away: meta.away,
      home: meta.home,
    })

    // Don't resolve until Final
    if (sched && !isMlbFinalStatus(sched.status) && !sched.final) {
      pending += 1
      continue
    }

    let win = null
    try {
      win = await resolveFromMlbStats(meta, schedule)
    } catch (err) {
      console.warn(`[mlb] ${row.title}:`, err instanceof Error ? err.message : err)
    }

    if (!win) {
      try {
        win = await resolveFromPolymarket(meta)
      } catch (err) {
        console.warn(`[poly] ${row.title}:`, err instanceof Error ? err.message : err)
      }
    }

    if (!win?.team) {
      pending += 1
      continue
    }

    const key = optionKeyForTeam(options, win.team)
    if (!key) {
      console.error(`[fail] Ei option-avainta voittajalle "${win.team}" — ${row.title}`)
      failed += 1
      continue
    }

    const notes = `auto:${win.source}${win.gamePk ? `:pk=${win.gamePk}` : ''}`

    if (dryRun) {
      console.log(`[dry] ${row.title} → ${key} (${win.team}) via ${win.source}`)
      resolved += 1
      continue
    }

    const { error: resErr } = await supabase.rpc('resolve_market_system', {
      p_market_id: row.id,
      p_winning_option: key,
      p_notes: notes,
    })

    if (resErr) {
      console.error(`[fail] ${row.title}: ${resErr.message}`)
      failed += 1
      continue
    }

    resolved += 1
    console.log(`[ok] ${row.title} → ${key} (${win.team}) via ${win.source} — Fyrkat maksettu`)
  }

  console.log(
    `[done] resolved=${resolved} pending=${pending} failed=${failed} closedFirst=${closedFirst}`
  )
  return { resolved, pending, failed, closedFirst }
}

async function main() {
  loadEnvFiles()
  const dryRun = process.argv.includes('--dry-run')
  try {
    await runMlbResolve({ dryRun })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
