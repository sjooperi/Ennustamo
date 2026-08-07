import { supabase } from '@/lib/supabase'
import {
  COMMUNITY_MONTHLY_CREATOR_REWARDS,
  COMMUNITY_TOP_CREATOR_REWARDS,
  MARKET_WIZARD_BADGE,
} from '@/lib/community'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'
import { fetchChampionIds } from '@/lib/leaderboard'

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
  hasMarketWizardBadge: boolean
  isTopPredictor: boolean
  isOracle: boolean
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

/** Previous completed week/month bounds (Helsinki), matching reward cron logic. */
function previousPeriodBounds(kind: RewardPeriodKind): {
  periodStart: string
  periodEnd: string
  label: string
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date())

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  const weekday = parts.find((p) => p.type === 'weekday')?.value || 'Mon'
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    weekday
  )
  // Days since Monday (Mon=0 … Sun=6)
  const sinceMonday = weekdayIndex === 0 ? 6 : weekdayIndex - 1

  if (kind === 'week') {
    const end = new Date(Date.UTC(year, month - 1, day))
    end.setUTCDate(end.getUTCDate() - sinceMonday)
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 7)
    const periodStart = start.toISOString().slice(0, 10)
    const periodEnd = end.toISOString().slice(0, 10)
    return {
      periodStart,
      periodEnd,
      label: formatPeriodLabel('week', periodStart, periodEnd),
    }
  }

  const endMonth = month === 1 ? 12 : month - 1
  const endYear = month === 1 ? year - 1 : year
  const periodStart = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-01`
  return {
    periodStart,
    periodEnd,
    label: formatPeriodLabel('month', periodStart, periodEnd),
  }
}

type AdminProfile = {
  id: string
  username: string | null
  display_name: string | null
  badges: string[]
}

function adminAward(
  admin: AdminProfile,
  kind: RewardPeriodKind,
  periodStart: string,
  periodEnd: string,
  rank = 1
): CreatorRewardAward {
  const name = resolvePublicName({
    username: admin.username,
    displayName: admin.display_name,
    email: null,
  })
  const rewardAmount = rewardAmountForRank(kind, rank)
  const badgeGranted = kind === 'month' && rank === 1
  return {
    id: `admin-${kind}-${periodStart}-${admin.id}`,
    periodKind: kind,
    periodStart,
    periodEnd,
    rank,
    marketId: null,
    marketTitle: 'Yhteisökohde',
    userId: admin.id,
    creatorName: name,
    creatorInitials: initialsFromPublicName(name),
    volume: 10_000,
    rewardAmount,
    badgeGranted,
    hasMarketWizardBadge:
      badgeGranted || admin.badges.includes(MARKET_WIZARD_BADGE),
    isTopPredictor: false,
    isOracle: false,
    isTest: false,
    createdAt: new Date().toISOString(),
  }
}

function pinAdminsToGroup(
  group: CreatorRewardPeriodGroup,
  admins: AdminProfile[]
): CreatorRewardPeriodGroup {
  if (admins.length === 0) return group

  const withoutAdmins = group.awards.filter(
    (a) => !admins.some((admin) => admin.id === a.userId)
  )
  const adminRows = admins.map((admin, i) =>
    adminAward(
      admin,
      group.periodKind,
      group.periodStart,
      group.periodEnd,
      i + 1
    )
  )
  const rest = withoutAdmins.map((a, i) => ({
    ...a,
    rank: adminRows.length + i + 1,
  }))

  return {
    ...group,
    awards: [...adminRows, ...rest].slice(0, 5),
  }
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

  const [awardsRes, adminsRes, champions] = await Promise.all([
    query,
    supabase
      .from('profiles')
      .select('id, username, display_name, badges')
      .eq('is_admin', true)
      .limit(5),
    fetchChampionIds(),
  ])

  if (awardsRes.error) {
    console.error('fetchCreatorRewardAwards:', awardsRes.error.message)
  }

  const admins: AdminProfile[] = (adminsRes.data || []).map((p) => ({
    id: p.id,
    username: p.username ?? null,
    display_name: p.display_name ?? null,
    badges: Array.isArray(p.badges) ? p.badges.filter(Boolean) : [],
  }))

  const rows = awardsRes.data || []
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  const profileById = new Map<
    string,
    {
      username: string | null
      display_name: string | null
      badges: string[]
    }
  >()

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, badges')
      .in('id', userIds)

    for (const p of profiles || []) {
      profileById.set(p.id, {
        username: p.username ?? null,
        display_name: p.display_name ?? null,
        badges: Array.isArray(p.badges) ? p.badges.filter(Boolean) : [],
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
    const badgeGranted = Boolean(row.badge_granted)
    const hasMarketWizardBadge =
      badgeGranted || Boolean(profile?.badges?.includes(MARKET_WIZARD_BADGE))

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
      badgeGranted,
      hasMarketWizardBadge,
      isTopPredictor: false,
      isOracle: false,
      isTest: Boolean(row.is_test),
      createdAt: row.created_at,
    })
  }

  const annotate = (g: CreatorRewardPeriodGroup): CreatorRewardPeriodGroup => ({
    ...g,
    awards: g.awards.map((a) => ({
      ...a,
      isTopPredictor: Boolean(
        champions.monthChampionId && a.userId === champions.monthChampionId
      ),
      isOracle: Boolean(
        champions.allTimeChampionId && a.userId === champions.allTimeChampionId
      ),
      hasMarketWizardBadge:
        a.hasMarketWizardBadge ||
        (a.periodKind === 'month' && a.rank === 1 && a.badgeGranted),
    })),
  })

  let result = [...groups.values()]
    .map((g) => pinAdminsToGroup(g, admins))
    .map(annotate)

  // If no real periods yet, still show admin on the current previous week/month.
  if (result.length === 0 && admins.length > 0) {
    const kinds: RewardPeriodKind[] =
      kind === 'all' ? ['week', 'month'] : [kind]
    result = kinds
      .slice(0, limitPeriods)
      .map((k) => {
        const bounds = previousPeriodBounds(k)
        return pinAdminsToGroup(
          {
            periodKind: k,
            periodStart: bounds.periodStart,
            periodEnd: bounds.periodEnd,
            label: bounds.label,
            awards: [],
          },
          admins
        )
      })
      .map(annotate)
  }

  return result
}
