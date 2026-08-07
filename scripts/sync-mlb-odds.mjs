/**
 * MLB lifecycle sync:
 * - Keep end_date = first pitch
 * - When game has started → status = closed (removed from open bets, awaiting result)
 * - Re-seed opening odds (Polymarket + 3pp) on markets with no bets yet
 *
 *   node scripts/sync-mlb-odds.mjs
 *   node scripts/sync-mlb-odds.mjs --dry-run
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  fetchMlbScheduleForDates,
  findScheduleGame,
  isMlbFinalStatus,
  isMlbLiveStatus,
  POLY_SKEW,
  poolsFromYesProb,
  skewedOpeningProb,
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

function sameInstant(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 30_000
}

function gameHasStarted(gameStart, status) {
  if (status && (isMlbLiveStatus(status) || isMlbFinalStatus(status))) return true
  if (!gameStart) return false
  return new Date(gameStart).getTime() <= Date.now()
}

function openingNeedsReseed(meta) {
  const polyYes = Number(meta?.poly_yes)
  if (!Number.isFinite(polyYes)) return false
  const target = skewedOpeningProb(polyYes)
  const skew = Number(meta?.skew)
  const opening = Number(meta?.opening_yes)
  if (Math.abs(skew - POLY_SKEW) > 1e-9) return true
  if (!Number.isFinite(opening) || Math.abs(opening - target) > 0.004) return true
  return false
}

export async function runMlbOddsSync(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const quiet = Boolean(options.quiet)
  const t0 = Date.now()

  if (!quiet) {
    console.log('=== MLB close-at-start sync ===')
    console.log(new Date().toISOString())
    console.log(`[info] Avausskew: +${POLY_SKEW * 100} pp vs Polymarket`)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL puuttuu')
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, title, metadata, end_date, external_id, status, yes_pool, no_pool, option_pools')
    .eq('subcategory', 'MLB')
    .eq('status', 'open')
    .not('external_id', 'is', null)

  if (error) throw new Error(error.message)

  const rows = markets || []
  if (!quiet) console.log(`[info] Avoimia MLB-kohteita: ${rows.length}`)
  if (rows.length === 0) {
    return {
      updated: 0,
      closed: 0,
      reseeded: 0,
      failed: 0,
      updates: [],
      duration_ms: Date.now() - t0,
    }
  }

  // Bet counts — only reseed markets nobody has wagered on
  const ids = rows.map((r) => r.id)
  const { data: betRows } = await supabase
    .from('bets')
    .select('market_id')
    .in('market_id', ids)
  const betted = new Set((betRows || []).map((b) => b.market_id))

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

  let updated = 0
  let closed = 0
  let reseeded = 0
  let failed = 0
  const updates = []

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? { ...row.metadata }
        : {}

    const sched = findScheduleGame(schedule, {
      gameDate: meta.game_date,
      away: meta.away,
      home: meta.home,
    })

    const gameStart = sched?.gameStart || meta.game_start || null
    if (!gameStart) {
      if (!quiet) console.warn(`[skip] ei alkamisaikaa: ${row.title}`)
      continue
    }

    const started = gameHasStarted(gameStart, sched?.status)
    let nextMeta = {
      ...meta,
      game_start: gameStart,
      mlb_game_pk: sched?.gamePk || meta.mlb_game_pk || null,
      mlb_status: sched?.status?.detailedState || meta.mlb_status || null,
      live: false,
      odds_locked: true,
      odds_mode: 'locked',
      betting_closes_at_start: true,
      skew: POLY_SKEW,
      awaiting_resolution: started,
      last_sync: new Date().toISOString(),
    }

    const endNeedsUpdate = !sameInstant(row.end_date, gameStart)

    // Re-apply Polymarket + 3pp opening if no bets yet
    let poolPatch = null
    if (!started && !betted.has(row.id) && openingNeedsReseed(meta)) {
      const polyYes = Number(meta.poly_yes)
      if (Number.isFinite(polyYes)) {
        const openingYes = skewedOpeningProb(polyYes)
        const pools = poolsFromYesProb(openingYes)
        poolPatch = {
          yes_pool: pools.yesSeed,
          no_pool: pools.noSeed,
          option_pools: { YES: pools.yesSeed, NO: pools.noSeed },
        }
        nextMeta = {
          ...nextMeta,
          opening_yes: pools.openingYesProb,
          skew: POLY_SKEW,
        }
      }
    }

    if (started) {
      if (dryRun) {
        if (!quiet) console.log(`[dry-close] ${row.title} → closed (odottaa ratkaisua)`)
        closed += 1
        updates.push({ id: row.id, status: 'closed', end_date: gameStart, metadata: nextMeta })
        continue
      }

      const { data, error: closeErr } = await supabase.rpc('close_market_system', {
        p_market_id: row.id,
        p_notes: 'game_started',
      })

      if (closeErr) {
        const { error: updErr } = await supabase
          .from('markets')
          .update({
            status: 'closed',
            end_date: gameStart,
            metadata: nextMeta,
          })
          .eq('id', row.id)

        if (updErr) {
          if (!quiet) console.error(`[fail] ${row.title}: ${closeErr.message}`)
          failed += 1
          continue
        }
      } else {
        await supabase
          .from('markets')
          .update({ end_date: gameStart, metadata: nextMeta })
          .eq('id', row.id)
      }

      closed += 1
      updates.push({
        id: row.id,
        status: 'closed',
        end_date: gameStart,
        metadata: nextMeta,
        ...(data || {}),
      })
      if (!quiet) console.log(`[closed] ${row.title} — odottaa ratkaisua`)
      continue
    }

    if (
      !endNeedsUpdate &&
      !poolPatch &&
      meta.game_start === gameStart &&
      Number(meta.skew) === POLY_SKEW
    ) {
      continue
    }

    const patch = {
      end_date: gameStart,
      metadata: nextMeta,
      ...(poolPatch || {}),
    }
    if (dryRun) {
      if (!quiet) {
        const extra = poolPatch
          ? ` | open→${(Number(nextMeta.opening_yes) * 100).toFixed(1)}% (+${POLY_SKEW * 100}pp)`
          : ''
        console.log(`[dry] ${row.title} | end→${gameStart}${extra}`)
      }
      if (poolPatch) reseeded += 1
      else updated += 1
      updates.push({ id: row.id, ...patch })
      continue
    }

    const { error: updErr } = await supabase.from('markets').update(patch).eq('id', row.id)
    if (updErr) {
      if (!quiet) console.error(`[fail] ${row.title}: ${updErr.message}`)
      failed += 1
      continue
    }

    if (poolPatch) {
      reseeded += 1
      if (!quiet) {
        console.log(
          `[reseed] ${row.title} | poly ${(Number(meta.poly_yes) * 100).toFixed(1)}% → ${(Number(nextMeta.opening_yes) * 100).toFixed(1)}% (+${POLY_SKEW * 100} pp)`
        )
      }
    } else {
      updated += 1
      if (!quiet) console.log(`[ok] ${row.title} | veto kiinni ${gameStart}`)
    }
    updates.push({ id: row.id, ...patch })
  }

  const duration_ms = Date.now() - t0
  if (!quiet) {
    console.log(
      `[done] closed=${closed} reseeded=${reseeded} updated=${updated} failed=${failed} ${duration_ms}ms`
    )
  }
  return { updated, closed, reseeded, failed, updates, duration_ms }
}

async function main() {
  loadEnvFiles()
  const dryRun = process.argv.includes('--dry-run')
  try {
    await runMlbOddsSync({ dryRun })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
