/**
 * Superpesis lifecycle sync:
 * - Keep end_date = game start
 * - When game has started → status = closed
 *
 *   node scripts/sync-superpesis-odds.mjs
 *   node scripts/sync-superpesis-odds.mjs --dry-run
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  SEASON_SERIES_MEN,
  SEASON_SERIES_WOMEN,
  fetchPesistuloksetMatches,
  findPesistulosMatch,
  isMatchFinished,
  isMatchLive,
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

function sameInstant(a, b) {
  if (!a && !b) return true
  if (!a || !b) return false
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 30_000
}

function gameHasStarted(gameStart, match) {
  if (match && (isMatchLive(match) || isMatchFinished(match))) return true
  if (!gameStart) return false
  return new Date(gameStart).getTime() <= Date.now()
}

export async function runSuperpesisOddsSync(options = {}) {
  const dryRun = Boolean(options.dryRun)
  const quiet = Boolean(options.quiet)
  const t0 = Date.now()

  if (!quiet) {
    console.log('=== Superpesis close-at-start sync ===')
    console.log(new Date().toISOString())
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
    .select('id, title, metadata, end_date, external_id, status')
    .eq('subcategory', 'Superpesis')
    .eq('status', 'open')
    .not('external_id', 'is', null)

  if (error) throw new Error(error.message)

  const rows = markets || []
  if (!quiet) console.log(`[info] Avoimia Superpesis-kohteita: ${rows.length}`)
  if (rows.length === 0) {
    return { updated: 0, closed: 0, failed: 0, duration_ms: Date.now() - t0 }
  }

  const bySeries = new Map()
  for (const ss of [SEASON_SERIES_MEN, SEASON_SERIES_WOMEN]) {
    try {
      bySeries.set(ss, await fetchPesistuloksetMatches(ss))
    } catch (err) {
      if (!quiet) {
        console.warn(
          `[warn] Pesistulokset ${ss}:`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  let updated = 0
  let closed = 0
  let failed = 0

  for (const row of rows) {
    const meta =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? { ...row.metadata }
        : {}

    const seriesId = Number(meta.season_series_id) || SEASON_SERIES_MEN
    const pack = bySeries.get(seriesId) || bySeries.get(SEASON_SERIES_MEN)
    const match = pack
      ? findPesistulosMatch(pack.matches, pack.teams, {
          gameDate: meta.game_date,
          away: meta.away,
          home: meta.home,
        })
      : null

    const gameStart = match?.date || meta.game_start || row.end_date
    if (!gameStart) {
      if (!quiet) console.warn(`[skip] ei alkamisaikaa: ${row.title}`)
      continue
    }

    const started = gameHasStarted(gameStart, match)
    const nextMeta = {
      ...meta,
      game_start: gameStart,
      pesistulokset_id: match?.id || meta.pesistulokset_id || null,
      live: Boolean(match && isMatchLive(match)),
      odds_locked: true,
      odds_mode: 'locked',
      betting_closes_at_start: true,
      awaiting_resolution: started,
      last_sync: new Date().toISOString(),
    }

    if (started) {
      if (dryRun) {
        if (!quiet) console.log(`[dry-close] ${row.title} → closed`)
        closed += 1
        continue
      }

      const { error: closeErr } = await supabase.rpc('close_market_system', {
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
      if (!quiet) console.log(`[closed] ${row.title} — odottaa ratkaisua`)
      continue
    }

    if (sameInstant(row.end_date, gameStart) && meta.game_start === gameStart) {
      continue
    }

    if (dryRun) {
      if (!quiet) console.log(`[dry] ${row.title} | end→${gameStart}`)
      updated += 1
      continue
    }

    const { error: updErr } = await supabase
      .from('markets')
      .update({ end_date: gameStart, metadata: nextMeta })
      .eq('id', row.id)

    if (updErr) {
      if (!quiet) console.error(`[fail] ${row.title}: ${updErr.message}`)
      failed += 1
      continue
    }
    updated += 1
    if (!quiet) console.log(`[ok] ${row.title} | veto kiinni ${gameStart}`)
  }

  const duration_ms = Date.now() - t0
  if (!quiet) {
    console.log(`[done] closed=${closed} updated=${updated} failed=${failed} ${duration_ms}ms`)
  }
  return { updated, closed, failed, duration_ms }
}

async function main() {
  loadEnvFiles()
  const dryRun = process.argv.includes('--dry-run')
  try {
    await runSuperpesisOddsSync({ dryRun })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
