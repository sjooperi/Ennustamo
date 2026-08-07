/**
 * Seed 10 Finnish demo nicknames onto the ROI leaderboard.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Also run migration 016 (total_bets) first.
 *
 *   node scripts/seed-leaderboard-bots.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

/** @type {{ username: string, roiPct: number, stakePerBet?: number }[]} */
const BOTS = [
  { username: 'SisuSpekulantti', roiPct: 42 },
  { username: 'SaunaSähläys', roiPct: 30 },
  { username: 'FyrkkaFani', roiPct: 22 },
  { username: 'PerunaProfeetta', roiPct: 15 },
  { username: 'KaamosKaveri', roiPct: 10 },
  { username: 'VetoVeikko', roiPct: 7 },
  { username: 'LaktoosiLalli', roiPct: 3 },
  { username: 'MämmiMaestro', roiPct: 0 },
  { username: 'RäntäRoi', roiPct: -8 },
  { username: 'JäätelöJorma', roiPct: -15 },
]

const BETS = 50
const STAKE_PER_BET = 100

loadEnvFiles()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Puuttuu NEXT_PUBLIC_SUPABASE_URL tai SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function round2(n) {
  return Math.round(n * 100) / 100
}

function emailSlug(username) {
  return username
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '')
}

async function upsertBot(bot) {
  const slug = emailSlug(bot.username)
  const email = `bot.${slug}@ennustamo.local`
  const password = `Bot-${slug}-2026!`
  const totalStaked = BETS * (bot.stakePerBet ?? STAKE_PER_BET)
  const totalReturned = round2(totalStaked * (1 + bot.roiPct / 100))
  const balance = round2(1000 + (totalReturned - totalStaked))

  // Find existing by email
  const { data: listed, error: listErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })
  if (listErr) throw listErr

  let userId = listed.users.find((u) => u.email === email)?.id

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: bot.username,
        name: bot.username,
        is_leaderboard_bot: true,
      },
    })
    if (error) throw error
    userId = data.user.id
    console.log(`[create] ${bot.username} (${userId})`)
  } else {
    console.log(`[exists] ${bot.username} (${userId})`)
  }

  const { error: upsertErr } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email,
      username: bot.username,
      display_name: bot.username,
      balance,
      fyrkat: balance,
      total_staked: totalStaked,
      total_returned: totalReturned,
      total_bets: BETS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (upsertErr) {
    // Retry without total_bets if migration 016 missing
    if (upsertErr.message?.includes('total_bets')) {
      const { error: retryErr } = await supabase.from('profiles').upsert(
        {
          id: userId,
          email,
          username: bot.username,
          display_name: bot.username,
          balance,
          fyrkat: balance,
          total_staked: totalStaked,
          total_returned: totalReturned,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      if (retryErr) throw retryErr
      console.warn(
        `  [warn] total_bets puuttuu — aja migraatio 016. ROI tallennettu ilman vetolaskuria.`
      )
    } else {
      throw upsertErr
    }
  }

  const score = round2(bot.roiPct * BETS ** 1.04)
  console.log(
    `  ROI ${bot.roiPct >= 0 ? '+' : ''}${bot.roiPct}% · ${BETS} vetoa · panos ${totalStaked} · palautus ${totalReturned} · score≈${score}`
  )
}

async function main() {
  console.log('=== Seed leaderboard bots ===')
  for (const bot of BOTS) {
    try {
      await upsertBot(bot)
    } catch (err) {
      console.error(`[fail] ${bot.username}:`, err instanceof Error ? err.message : err)
    }
  }
  console.log('[done]')
}

void main()
