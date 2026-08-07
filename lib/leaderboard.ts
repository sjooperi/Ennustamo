import { STARTING_BALANCE } from '@/lib/auth-profile'
import { MARKET_WIZARD_BADGE } from '@/lib/community'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'
import {
  calcLeaderboardScore,
  calcRoi,
  LEADERBOARD_MIN_BETS,
} from '@/lib/roi'
import { supabase } from '@/lib/supabase'

export type LeaderboardRow = {
  id: string
  name: string
  initials: string
  balance: number
  totalStaked: number
  totalReturned: number
  totalBets: number
  roi: number
  score: number
  profit: number
  hasMarketWizardBadge: boolean
  isAdmin: boolean
}

type ProfileLeaderboardSource = {
  id: string
  display_name?: string | null
  username?: string | null
  email?: string | null
  balance?: number | string | null
  fyrkat?: number | string | null
  total_staked?: number | string | null
  total_returned?: number | string | null
  total_bets?: number | string | null
  roi_pct?: number | string | null
  badges?: string[] | null
  is_admin?: boolean | null
}

function hasWizardBadge(badges: string[] | null | undefined): boolean {
  return Array.isArray(badges) && badges.includes(MARKET_WIZARD_BADGE)
}

function mapRow(
  row: ProfileLeaderboardSource,
  options?: { allowAdminBypass?: boolean }
): LeaderboardRow | null {
  const isAdmin = Boolean(row.is_admin)
  const totalStaked = Number(row.total_staked ?? 0)
  const totalBets = Math.floor(Number(row.total_bets ?? 0))
  const allowBypass = Boolean(options?.allowAdminBypass && isAdmin)

  if (!(totalStaked > 0) && !allowBypass) return null
  if (totalBets < LEADERBOARD_MIN_BETS && !allowBypass) return null

  const totalReturned = Number(row.total_returned ?? 0)
  const roiFromDb = row.roi_pct != null ? Number(row.roi_pct) : null
  let roi =
    roiFromDb != null && Number.isFinite(roiFromDb)
      ? roiFromDb
      : calcRoi(totalStaked, totalReturned)

  // Admin without real volume still appears at the top with a strong display score.
  if (roi == null) {
    if (!allowBypass) return null
    roi = 100
  }

  const score =
    calcLeaderboardScore(roi, Math.max(totalBets, LEADERBOARD_MIN_BETS)) ??
    roi * Math.pow(LEADERBOARD_MIN_BETS, 1.04)

  const balance = Number(row.balance ?? row.fyrkat ?? STARTING_BALANCE)
  const name = resolvePublicName({
    username: typeof row.username === 'string' ? row.username : null,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    email: typeof row.email === 'string' ? row.email : null,
  })

  const effectiveStaked = totalStaked > 0 ? totalStaked : STARTING_BALANCE
  const effectiveReturned =
    totalStaked > 0 ? totalReturned : STARTING_BALANCE * (1 + roi / 100)

  return {
    id: row.id,
    name,
    initials: initialsFromPublicName(name),
    balance,
    totalStaked: effectiveStaked,
    totalReturned: effectiveReturned,
    totalBets: Math.max(totalBets, allowBypass ? LEADERBOARD_MIN_BETS : totalBets),
    roi,
    score: isAdmin ? Number.MAX_SAFE_INTEGER / 2 + score : score,
    profit: effectiveReturned - effectiveStaked,
    hasMarketWizardBadge: hasWizardBadge(row.badges),
    isAdmin,
  }
}

function sortLeaderboard(a: LeaderboardRow, b: LeaderboardRow): number {
  // Admins always lead the public ROI table.
  if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1
  return (
    b.score - a.score ||
    b.roi - a.roi ||
    b.profit - a.profit ||
    b.totalBets - a.totalBets
  )
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const primary = await supabase
    .from('profiles')
    .select(
      'id, display_name, username, email, balance, fyrkat, total_staked, total_returned, total_bets, roi_pct, badges, is_admin'
    )
    .or(`total_bets.gte.${LEADERBOARD_MIN_BETS},is_admin.eq.true`)
    .limit(Math.max(limit * 4, 200))

  if (primary.error) {
    console.warn(
      'Leaderboard query failed, trying without admin/badge columns:',
      primary.error.message
    )
    const legacy = await supabase
      .from('profiles')
      .select(
        'id, display_name, username, email, balance, fyrkat, total_staked, total_returned, total_bets, roi_pct, is_admin'
      )
      .or(`total_bets.gte.${LEADERBOARD_MIN_BETS},is_admin.eq.true`)
      .limit(Math.max(limit * 4, 200))

    if (legacy.error) {
      console.warn('ROI leaderboard query failed, falling back:', legacy.error.message)
      const fallback = await supabase
        .from('profiles')
        .select('id, display_name, username, email, balance, fyrkat, is_admin')
        .order('balance', { ascending: false })
        .limit(limit)

      if (fallback.error || !fallback.data) {
        console.error('Failed to load leaderboard:', fallback.error?.message)
        return []
      }

      return fallback.data
        .map((row) => {
          const balance = Number(row.balance ?? row.fyrkat ?? STARTING_BALANCE)
          const name = resolvePublicName({
            username: typeof row.username === 'string' ? row.username : null,
            displayName:
              typeof row.display_name === 'string' ? row.display_name : null,
            email: typeof row.email === 'string' ? row.email : null,
          })
          const isAdmin = Boolean(row.is_admin)
          return {
            id: row.id,
            name,
            initials: initialsFromPublicName(name),
            balance,
            totalStaked: 0,
            totalReturned: 0,
            totalBets: 0,
            roi: isAdmin ? 100 : 0,
            score: isAdmin ? Number.MAX_SAFE_INTEGER / 2 : 0,
            profit: balance - STARTING_BALANCE,
            hasMarketWizardBadge: false,
            isAdmin,
          } satisfies LeaderboardRow
        })
        .sort(sortLeaderboard)
        .slice(0, limit)
    }

    return (legacy.data ?? [])
      .map((row) => mapRow(row, { allowAdminBypass: true }))
      .filter((row): row is LeaderboardRow => row != null)
      .sort(sortLeaderboard)
      .slice(0, limit)
  }

  return (primary.data ?? [])
    .map((row) => mapRow(row, { allowAdminBypass: true }))
    .filter((row): row is LeaderboardRow => row != null)
    .sort(sortLeaderboard)
    .slice(0, limit)
}
