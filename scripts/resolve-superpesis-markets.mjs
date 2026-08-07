/**
 * Auto-resolve closed Superpesis markets from Pesistulokset results.
 *
 *   node scripts/resolve-superpesis-markets.mjs
 *   node scripts/resolve-superpesis-markets.mjs --dry-run
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
  optionKeyForTeam,
  teamName,
  winnerFromPesistulos,
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

export async function runSuperpesisResolve(options = {}) {
  const dryRun = Boolean(options.dryRun)
  console.log('=== Superpesis resolve + payouts ===')
  console.log(new Date().toISOString())

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
    .select('id, title, options, metadata, external_id, status, end_date, subcategory')
    .eq('subcategory', 'Superpesis')
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
    return Boolean(startIso && new Date(startIso).getTime() <= now)
  })

  console.log(`[info] Ratkaistavia / odottavia Superpesis-kohteita: ${rows.length}`)

  const bySeries = new Map()
  for (const ss of [SEASON_SERIES_MEN, SEASON_SERIES_WOMEN]) {
    try {
      bySeries.set(ss, await fetchPesistuloksetMatches(ss))
    } catch (err) {
      console.warn(`[warn] Pesistulokset ${ss}:`, err instanceof Error ? err.message : err)
    }
  }

  let resolved = 0
  let pending = 0
  let failed = 0
  let closedFirst = 0

  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    const options = parseOptions(row.options)
    const status = String(row.status || '').toLowerCase()

    if (status === 'open' && !dryRun) {
      const { error: closeErr } = await supabase.rpc('close_market_system', {
        p_market_id: row.id,
        p_notes: 'game_started_before_resolve',
      })
      if (!closeErr) closedFirst += 1
    }

    const seriesId = Number(meta.season_series_id) || SEASON_SERIES_MEN
    const pack = bySeries.get(seriesId) || bySeries.get(SEASON_SERIES_MEN)
    if (!pack) {
      pending += 1
      continue
    }

    let match = null
    if (meta.pesistulokset_id) {
      match = pack.matches.find((m) => m.id === meta.pesistulokset_id) || null
    }
    if (!match) {
      match = findPesistulosMatch(pack.matches, pack.teams, {
        gameDate: meta.game_date,
        away: meta.away,
        home: meta.home,
      })
    }

    if (!match || !isMatchFinished(match)) {
      pending += 1
      continue
    }

    const home = teamName(pack.teams, match.home)
    const away = teamName(pack.teams, match.away)
    const win = winnerFromPesistulos(match.result, home, away)
    if (!win?.team) {
      pending += 1
      continue
    }

    const key = optionKeyForTeam(options, win.team)
    if (!key) {
      // Fallback: match against metadata labels
      const metaKey = optionKeyForTeam(
        [
          { key: 'YES', label: meta.away },
          { key: 'NO', label: meta.home },
        ],
        win.team
      )
      if (!metaKey) {
        console.error(`[fail] Ei option-avainta voittajalle "${win.team}" — ${row.title}`)
        failed += 1
        continue
      }
      // Map meta YES/NO onto actual options order (away=YES, home=NO)
      const resolvedKey =
        metaKey === 'YES'
          ? optionKeyForTeam(options, meta.away) || 'YES'
          : optionKeyForTeam(options, meta.home) || 'NO'
      if (dryRun) {
        console.log(`[dry] ${row.title} → ${resolvedKey} (${win.team}) via ${win.source}`)
        resolved += 1
        continue
      }
      const { error: resErr } = await supabase.rpc('resolve_market_system', {
        p_market_id: row.id,
        p_winning_option: resolvedKey,
        p_notes: `auto:${win.source}:id=${match.id}`,
      })
      if (resErr) {
        console.error(`[fail] ${row.title}: ${resErr.message}`)
        failed += 1
        continue
      }
      resolved += 1
      console.log(`[ok] ${row.title} → ${resolvedKey} (${win.team}) — Fyrkat maksettu`)
      continue
    }

    if (dryRun) {
      console.log(`[dry] ${row.title} → ${key} (${win.team}) via ${win.source}`)
      resolved += 1
      continue
    }

    const { error: resErr } = await supabase.rpc('resolve_market_system', {
      p_market_id: row.id,
      p_winning_option: key,
      p_notes: `auto:${win.source}:id=${match.id}`,
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
    await runSuperpesisResolve({ dryRun })
    process.exit(0)
  } catch (err) {
    console.error('[fatal]', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

const isDirect =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) void main()
