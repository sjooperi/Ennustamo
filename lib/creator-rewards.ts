import { supabase } from '@/lib/supabase'
import {
  COMMUNITY_MONTHLY_CREATOR_REWARDS,
  COMMUNITY_TOP_CREATOR_REWARDS,
} from '@/lib/community'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'

export type RewardPeriodKind = 'week' | 'month'

export type CreatorRewardAward = {
  id: string
  periodKind: RewardPeriodKind
  periodStart: string
  periodEnd: string
  rank: number
  marketId: string | null
  marketTitle: string | null
  userId: string
  creatorName: string
  creatorInitials: string
  volume: number
  rewardAmount: number
  badgeGranted: boolean
  isTest: boolean
  createdAt: string
}

export type CreatorRewardPeriodGroup = {
  periodKind: RewardPeriodKind
  periodStart: string
  periodEnd: string
  label: string
  awards: CreatorRewardAward[]
}

function formatPeriodLabel(kind: RewardPeriodKind, start: string, end: string): string {
  const startDate = new Date(`${start}T12:00:00`)
  const endDate = new Date(`${end}T12:00:00`)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return start
  }

  if (kind === 'month') {
    return startDate.toLocaleDateString('fi-FI', {
      month: 'long',
      year: 'numeric',
    })
  }

  const lastDay = new Date(endDate)
  lastDay.setDate(lastDay.getDate() - 1)
  const a = startDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })
  const b = lastDay.toLocaleDateString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
  return `${a}–${b}`
}

export function rewardAmountForRank(
  kind: RewardPeriodKind,
  rank: number
): number {
  const list =
    kind === 'week'
      ? COMMUNITY_TOP_CREATOR_REWARDS
      : COMMUNITY_MONTHLY_CREATOR_REWARDS
  return list[rank - 1] ?? 0
}

export async function fetchCreatorRewardAwards(options?: {
  kind?: RewardPeriodKind | 'all'
  limitPeriods?: number
  includeTests?: boolean
}): Promise<CreatorRewardPeriodGroup[]> {
  const kind = options?.kind ?? 'all'
  const limitPeriods = options?.limitPeriods ?? 8
  const includeTests = options?.includeTests ?? false

  let query = supabase
    .from('creator_reward_awards')
    .select(
      'id, period_kind, period_start, period_end, rank, market_id, market_title, user_id, volume, reward_amount, badge_granted, is_test, created_at'
    )
    .order('period_start', { ascending: false })
    .order('rank', { ascending: true })
    .limit(200)

  if (kind !== 'all') {
    query = query.eq('period_kind', kind)
  }
  if (!includeTests) {
    query = query.eq('is_test', false)
  }

  const { data, error } = await query
  if (error) {
    console.error('fetchCreatorRewardAwards:', error.message)
    return []
  }

  const rows = data || []
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const profileById = new Map<
    string,
    { username: string | null; display_name: string | null }
  >()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', userIds)

    for (const p of profiles || []) {
      profileById.set(p.id, {
        username: p.username ?? null,
        display_name: p.display_name ?? null,
      })
    }
  }

  const groups = new Map<string, CreatorRewardPeriodGroup>()

  for (const row of rows) {
    const periodKind = row.period_kind as RewardPeriodKind
    const key = `${periodKind}:${row.period_start}`
    if (!groups.has(key)) {
      if (groups.size >= limitPeriods) continue
      groups.set(key, {
        periodKind,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        label: formatPeriodLabel(periodKind, row.period_start, row.period_end),
        awards: [],
      })
    }

    const group = groups.get(key)
    if (!group) continue

    const profile = profileById.get(row.user_id)
    const creatorName = resolvePublicName({
      username: profile?.username,
      displayName: profile?.display_name,
      email: null,
    })

    group.awards.push({
      id: row.id,
      periodKind,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      rank: Number(row.rank),
      marketId: row.market_id ?? null,
      marketTitle: row.market_title ?? null,
      userId: row.user_id,
      creatorName,
      creatorInitials: initialsFromPublicName(creatorName),
      volume: Number(row.volume || 0),
      rewardAmount: Number(row.reward_amount || 0),
      badgeGranted: Boolean(row.badge_granted),
      isTest: Boolean(row.is_test),
      createdAt: row.created_at,
    })
  }

  return [...groups.values()]
}
