import { STARTING_BALANCE } from '@/lib/auth-profile'
import { MARKET_WIZARD_BADGE } from '@/lib/community'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'
import {
  calcLeaderboardScore,
  calcTuottoPct,
  LEADERBOARD_MIN_BETS_ALLTIME,
  LEADERBOARD_MIN_BETS_MONTHLY,
} from '@/lib/roi'
import { supabase } from '@/lib/supabase'

export type LeaderboardPeriod = 'month' | 'alltime'

export type LeaderboardRow = {
  id: string
  name: string
  initials: string
  balance: number
  totalStaked: number
  totalReturned: number
  totalBets: number
  tuotto: number
  score: number
  profit: number
  hasMarketWizardBadge: boolean
  /** #1 on monthly list → Kuukauden ennustaja */
  isTopPredictor: boolean
  /** #1 on all-time list → Kaikkien aikojen ennustaja */
  isOracle: boolean
  isAdmin: boolean
  period: LeaderboardPeriod
  periodLabel: string
}

function helsinkiOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Helsinki',
    timeZoneName: 'longOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT'
  const match = tz.match(/GMT([+-])(\d+)(?::?(\d+))?/)
  if (!match) return 2 * 60 * 60 * 1000
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const mins = Number(match[3] || 0)
  return sign * (hours * 60 + mins) * 60_000
}

function helsinkiLocalToUtcIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): string {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const offset = helsinkiOffsetMs(new Date(utcGuess))
  return new Date(utcGuess - offset).toISOString()
}

export function currentMonthBoundsHelsinki(now = new Date()): {
  startIso: string
  endIso: string
  label: string
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const label = new Date(
    `${year}-${String(month).padStart(2, '0')}-15T12:00:00`
  ).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' })

  return {
    startIso: helsinkiLocalToUtcIso(year, month, 1),
    endIso: helsinkiLocalToUtcIso(nextYear, nextMonth, 1),
    label,
  }
}

function hasWizardBadge(badges: string[] | null | undefined): boolean {
  return Array.isArray(badges) && badges.includes(MARKET_WIZARD_BADGE)
}

type ProfileLite = {
  id: string
  display_name?: string | null
  username?: string | null
  email?: string | null
  balance?: number | string | null
  fyrkat?: number | string | null
  badges?: string[] | null
  is_admin?: boolean | null
  total_staked?: number | string | null
  total_returned?: number | string | null
  total_bets?: number | string | null
  roi_pct?: number | string | null
}

function sortRows(a: LeaderboardRow, b: LeaderboardRow): number {
  if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
  return (
    b.score - a.score ||
    b.tuotto - a.tuotto ||
    b.profit - a.profit ||
    b.totalBets - a.totalBets
  )
}

function buildRow(input: {
  profile: ProfileLite
  staked: number
  returned: number
  bets: number
  tuotto: number
  score: number
  period: LeaderboardPeriod
  periodLabel: string
}): LeaderboardRow {
  const { profile } = input
  const isAdmin = Boolean(profile.is_admin)
  const name = resolvePublicName({
    username: profile.username ?? null,
    displayName: profile.display_name ?? null,
    email: profile.email ?? null,
  })
  return {
    id: profile.id,
    name,
    initials: initialsFromPublicName(name),
    balance: Number(profile.balance ?? profile.fyrkat ?? STARTING_BALANCE),
    totalStaked: input.staked,
    totalReturned: input.returned,
    totalBets: input.bets,
    tuotto: input.tuotto,
    score: isAdmin ? Number.MAX_SAFE_INTEGER / 2 + input.score : input.score,
    profit: input.returned - input.staked,
    hasMarketWizardBadge: hasWizardBadge(profile.badges),
    isTopPredictor: false,
    isOracle: false,
    isAdmin,
    period: input.period,
    periodLabel: input.periodLabel,
  }
}

function ensureAdminRows(
  rows: LeaderboardRow[],
  profiles: ProfileLite[],
  period: LeaderboardPeriod,
  periodLabel: string,
  minBets: number
): void {
  for (const profile of profiles) {
    if (!profile.is_admin) continue
    if (rows.some((r) => r.id === profile.id)) continue
    rows.push(
      buildRow({
        profile,
        staked: STARTING_BALANCE,
        returned: STARTING_BALANCE * 2,
        bets: minBets,
        tuotto: 100,
        score: Number.MAX_SAFE_INTEGER / 2,
        period,
        periodLabel,
      })
    )
  }
}

function applyChampionBadges(
  rows: LeaderboardRow[],
  monthChampionId: string | null,
  allTimeChampionId: string | null
): LeaderboardRow[] {
  return rows.map((row) => ({
    ...row,
    isTopPredictor: Boolean(monthChampionId && row.id === monthChampionId),
    isOracle: Boolean(allTimeChampionId && row.id === allTimeChampionId),
  }))
}

/** Current holders of Kuukauden ennustaja / Kaikkien aikojen ennustaja. */
export async function fetchChampionIds(): Promise<{
  monthChampionId: string | null
  allTimeChampionId: string | null
}> {
  const [monthly, alltime] = await Promise.all([
    computeMonthlyLeaderboard(1),
    computeAllTimeLeaderboard(1),
  ])
  return {
    monthChampionId: monthly[0]?.id ?? null,
    allTimeChampionId: alltime[0]?.id ?? null,
  }
}

/** Monthly leaderboard (current calendar month, Helsinki). */
export async function fetchMonthlyLeaderboard(
  limit = 50
): Promise<LeaderboardRow[]> {
  const [rows, allTimeTop] = await Promise.all([
    computeMonthlyLeaderboard(limit),
    computeAllTimeLeaderboard(1),
  ])
  return applyChampionBadges(
    rows,
    rows[0]?.id ?? null,
    allTimeTop[0]?.id ?? null
  )
}

async function computeMonthlyLeaderboard(
  limit = 50
): Promise<LeaderboardRow[]> {
  const { startIso, endIso, label } = currentMonthBoundsHelsinki()

  const [betsRes, payoutsRes, profilesRes] = await Promise.all([
    supabase
      .from('bets')
      .select('user_id, amount')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('market_payouts')
      .select('user_id, payout_amount')
      .gte('created_at', startIso)
      .lt('created_at', endIso),
    supabase
      .from('profiles')
      .select('id, display_name, username, email, balance, fyrkat, badges, is_admin')
      .limit(500),
  ])

  if (profilesRes.error) {
    console.error('Monthly leaderboard profiles failed:', profilesRes.error.message)
    return []
  }
  if (betsRes.error) console.warn('Monthly bets failed:', betsRes.error.message)
  if (payoutsRes.error) {
    console.warn('Monthly payouts failed:', payoutsRes.error.message)
  }

  type Agg = { staked: number; returned: number; bets: number }
  const agg = new Map<string, Agg>()

  for (const bet of betsRes.data || []) {
    const amount = Number(bet.amount || 0)
    if (!(amount > 0)) continue
    const cur = agg.get(bet.user_id) || { staked: 0, returned: 0, bets: 0 }
    cur.staked += amount
    cur.bets += 1
    agg.set(bet.user_id, cur)
  }
  for (const pay of payoutsRes.data || []) {
    const amount = Number(pay.payout_amount || 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    const cur = agg.get(pay.user_id) || { staked: 0, returned: 0, bets: 0 }
    cur.returned += amount
    agg.set(pay.user_id, cur)
  }

  const profiles = (profilesRes.data || []) as ProfileLite[]
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const rows: LeaderboardRow[] = []

  for (const [userId, stats] of agg) {
    const profile = profileById.get(userId)
    if (!profile) continue
    const isAdmin = Boolean(profile.is_admin)
    if (stats.bets < LEADERBOARD_MIN_BETS_MONTHLY && !isAdmin) continue
    if (!(stats.staked > 0) && !isAdmin) continue
    const tuotto =
      calcTuottoPct(stats.staked, stats.returned) ?? (isAdmin ? 0 : null)
    if (tuotto == null) continue
    const score =
      calcLeaderboardScore(
        tuotto,
        Math.max(stats.bets, LEADERBOARD_MIN_BETS_MONTHLY),
        LEADERBOARD_MIN_BETS_MONTHLY
      ) ?? tuotto
    rows.push(
      buildRow({
        profile,
        staked: stats.staked,
        returned: stats.returned,
        bets: stats.bets,
        tuotto,
        score,
        period: 'month',
        periodLabel: label,
      })
    )
  }

  ensureAdminRows(rows, profiles, 'month', label, LEADERBOARD_MIN_BETS_MONTHLY)
  rows.sort(sortRows)

  return rows.slice(0, limit)
}

/**
 * All-time leaderboard.
 * Requires ≥50 positive bets on markets with status = resolved.
 * Tuotto from lifetime profile counters (staked / returned).
 */
export async function fetchAllTimeLeaderboard(
  limit = 50
): Promise<LeaderboardRow[]> {
  const [rows, monthTop] = await Promise.all([
    computeAllTimeLeaderboard(limit),
    computeMonthlyLeaderboard(1),
  ])
  return applyChampionBadges(
    rows,
    monthTop[0]?.id ?? null,
    rows[0]?.id ?? null
  )
}

async function computeAllTimeLeaderboard(
  limit = 50
): Promise<LeaderboardRow[]> {
  const [resolvedBetsRes, profilesRes] = await Promise.all([
    supabase
      .from('bets')
      .select('user_id, amount, markets!inner(status)')
      .eq('markets.status', 'resolved')
      .gt('amount', 0)
      .limit(20000),
    supabase
      .from('profiles')
      .select(
        'id, display_name, username, email, balance, fyrkat, badges, is_admin, total_staked, total_returned, total_bets, roi_pct'
      )
      .or(`total_bets.gte.${LEADERBOARD_MIN_BETS_ALLTIME},is_admin.eq.true`)
      .limit(500),
  ])

  if (profilesRes.error) {
    console.error('All-time leaderboard profiles failed:', profilesRes.error.message)
    return []
  }

  const resolvedCount = new Map<string, number>()
  if (resolvedBetsRes.error) {
    console.warn(
      'Resolved bets query failed, falling back to total_bets:',
      resolvedBetsRes.error.message
    )
  } else {
    for (const bet of resolvedBetsRes.data || []) {
      resolvedCount.set(bet.user_id, (resolvedCount.get(bet.user_id) || 0) + 1)
    }
  }

  const profiles = (profilesRes.data || []) as ProfileLite[]
  const rows: LeaderboardRow[] = []

  for (const profile of profiles) {
    const isAdmin = Boolean(profile.is_admin)
    const resolvedBets = resolvedCount.has(profile.id)
      ? (resolvedCount.get(profile.id) || 0)
      : Math.floor(Number(profile.total_bets || 0))

    if (resolvedBets < LEADERBOARD_MIN_BETS_ALLTIME && !isAdmin) continue

    const staked = Number(profile.total_staked || 0)
    const returned = Number(profile.total_returned || 0)
    if (!(staked > 0) && !isAdmin) continue

    const tuottoFromDb =
      profile.roi_pct != null ? Number(profile.roi_pct) : null
    const tuotto =
      tuottoFromDb != null && Number.isFinite(tuottoFromDb)
        ? tuottoFromDb
        : calcTuottoPct(staked, returned) ?? (isAdmin ? 100 : null)
    if (tuotto == null) continue

    const betsForScore = Math.max(resolvedBets, LEADERBOARD_MIN_BETS_ALLTIME)
    const score =
      calcLeaderboardScore(tuotto, betsForScore, LEADERBOARD_MIN_BETS_ALLTIME) ??
      tuotto

    rows.push(
      buildRow({
        profile,
        staked: staked > 0 ? staked : STARTING_BALANCE,
        returned: staked > 0 ? returned : STARTING_BALANCE * 2,
        bets: resolvedBets || LEADERBOARD_MIN_BETS_ALLTIME,
        tuotto,
        score,
        period: 'alltime',
        periodLabel: 'Kaikkien aikojen',
      })
    )
  }

  ensureAdminRows(
    rows,
    profiles,
    'alltime',
    'Kaikkien aikojen',
    LEADERBOARD_MIN_BETS_ALLTIME
  )
  rows.sort(sortRows)

  return rows.slice(0, limit)
}

/** @deprecated prefer fetchMonthlyLeaderboard */
export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  return fetchMonthlyLeaderboard(limit)
}
