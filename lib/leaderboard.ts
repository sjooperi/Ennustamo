import { STARTING_BALANCE } from '@/lib/auth-profile'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'
import { calcRoi } from '@/lib/roi'
import { supabase } from '@/lib/supabase'

export type LeaderboardRow = {
  id: string
  name: string
  initials: string
  balance: number
  totalStaked: number
  totalReturned: number
  roi: number
  profit: number
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
  roi_pct?: number | string | null
}

function mapRow(row: ProfileLeaderboardSource): LeaderboardRow | null {
  const totalStaked = Number(row.total_staked ?? 0)
  if (!(totalStaked > 0)) return null

  const totalReturned = Number(row.total_returned ?? 0)
  const roiFromDb = row.roi_pct != null ? Number(row.roi_pct) : null
  const roi =
    roiFromDb != null && Number.isFinite(roiFromDb)
      ? roiFromDb
      : calcRoi(totalStaked, totalReturned)
  if (roi == null) return null

  const balance = Number(row.balance ?? row.fyrkat ?? STARTING_BALANCE)
  const name = resolvePublicName({
    username: typeof row.username === 'string' ? row.username : null,
    displayName: typeof row.display_name === 'string' ? row.display_name : null,
    email: typeof row.email === 'string' ? row.email : null,
  })

  return {
    id: row.id,
    name,
    initials: initialsFromPublicName(name),
    balance,
    totalStaked,
    totalReturned,
    roi,
    profit: totalReturned - totalStaked,
  }
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardRow[]> {
  const primary = await supabase
    .from('profiles')
    .select(
      'id, display_name, username, email, balance, fyrkat, total_staked, total_returned, roi_pct'
    )
    .gt('total_staked', 0)
    .order('roi_pct', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (primary.error) {
    console.warn('ROI leaderboard query failed, falling back:', primary.error.message)
    const fallback = await supabase
      .from('profiles')
      .select('id, display_name, username, email, balance, fyrkat')
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
          displayName: typeof row.display_name === 'string' ? row.display_name : null,
          email: typeof row.email === 'string' ? row.email : null,
        })
        return {
          id: row.id,
          name,
          initials: initialsFromPublicName(name),
          balance,
          totalStaked: 0,
          totalReturned: 0,
          roi: 0,
          profit: balance - STARTING_BALANCE,
        } satisfies LeaderboardRow
      })
      .sort((a, b) => b.profit - a.profit)
  }

  return (primary.data ?? [])
    .map(mapRow)
    .filter((row): row is LeaderboardRow => row != null)
    .sort((a, b) => b.roi - a.roi || b.profit - a.profit || b.totalStaked - a.totalStaked)
}
