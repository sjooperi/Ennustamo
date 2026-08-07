import { supabase } from '@/lib/supabase'

export const COMMUNITY_CATEGORY = 'Yhteisö'
export const COMMUNITY_CREATOR_STAKE = 50
export const COMMUNITY_MAX_DAILY = 2
export const COMMUNITY_RESOLVE_HOURS = 24
export const COMMUNITY_REPORT_THRESHOLD = 5
export const COMMUNITY_MAX_OPTIONS = 8
export const COMMUNITY_TOP_CROSS_PROMOTE = 5

/** Weekly Fyrkka rewards for top community market creators (by period volume). */
export const COMMUNITY_TOP_CREATOR_REWARDS = [200, 150, 100, 50, 25] as const

/** Monthly rewards = 2× weekly. Rank 1 also gets Kuukauden markkinavelho badge. */
export const COMMUNITY_MONTHLY_CREATOR_REWARDS = COMMUNITY_TOP_CREATOR_REWARDS.map(
  (n) => n * 2
) as readonly [number, number, number, number, number]

export const MARKET_WIZARD_BADGE = 'market_wizard' as const
export const MARKET_WIZARD_BADGE_LABEL = 'Kuukauden markkinavelho'

/** Topic categories community markets can belong to (cross-promoted when in top 5). */
export const COMMUNITY_TOPIC_CATEGORIES = [
  'Politiikka',
  'Talous',
  'Urheilu',
  'Viihde',
  'Teknologia',
] as const

export type CommunityTopicCategory =
  (typeof COMMUNITY_TOPIC_CATEGORIES)[number]

export const COMMUNITY_REPORT_REASONS = [
  'Epäselvä',
  'Harhaanjohtava',
  'Roskasisältö',
  'Muu',
] as const

export type CreateCommunityMarketInput = {
  title: string
  options: string[]
  endDate: string
  resolutionCriteria?: string | null
  topicCategory: CommunityTopicCategory | string
}

function translateCommunityError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään luodaksesi kohteen.'
  if (message.includes('DAILY_LIMIT')) {
    return 'Voit luoda enintään 2 kohdetta päivässä.'
  }
  if (message.includes('INSUFFICIENT_BALANCE')) {
    return `Saldo ei riitä panttiin (${COMMUNITY_CREATOR_STAKE} Fyrkkaa).`
  }
  if (message.includes('INVALID_TITLE')) return 'Kirjoita vähintään 3 merkin kysymys.'
  if (message.includes('TOO_MANY_OPTIONS')) {
    return `Voit asettaa enintään ${COMMUNITY_MAX_OPTIONS} vaihtoehtoa.`
  }
  if (message.includes('INVALID_OPTIONS')) {
    return 'Lisää vähintään kaksi eri vastausvaihtoehtoa.'
  }
  if (message.includes('INVALID_END_DATE')) {
    return 'Sulkeutumisajan pitää olla tulevaisuudessa.'
  }
  if (message.includes('INVALID_TOPIC')) {
    return 'Valitse kategoria, johon kohde kuuluu.'
  }
  if (message.includes('INVALID_CRITERIA')) {
    return 'Kerro lyhyesti, miten kohde ratkaistaan.'
  }
  if (message.includes('TOO_EARLY')) {
    return 'Kohdetta ei voi vielä ratkaista — sulkeutumisaika ei ole ohi.'
  }
  if (message.includes('RESOLUTION_EXPIRED')) {
    return 'Ratkaisuajan määräaika on umpeutunut.'
  }
  if (message.includes('FORBIDDEN')) return 'Vain kohteen luoja voi ratkaista tämän.'
  if (message.includes('ALREADY_RESOLVED')) return 'Kohde on jo ratkaistu.'
  if (message.includes('MARKET_CLOSED')) return 'Kohde on suljettu tai poistettu.'
  if (message.includes('ALREADY_REPORTED')) return 'Olet jo raportoinut tämän kohteen.'
  if (message.includes('OWN_MARKET')) return 'Et voi raportoida omaa kohdettasi.'
  if (message.includes('NOT_COMMUNITY')) return 'Vain yhteisökohteita voi raportoida.'
  if (message.includes('INVALID_REASON')) return 'Valitse raportin syy.'
  return message
}

export async function createCommunityMarket(
  input: CreateCommunityMarketInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const criteria = (input.resolutionCriteria || '').trim()
  const { data, error } = await supabase.rpc('create_community_market', {
    p_title: input.title,
    p_options: input.options,
    p_end_date: input.endDate,
    p_resolution_criteria: criteria.length > 0 ? criteria : null,
    p_stake: COMMUNITY_CREATOR_STAKE,
    p_topic_category: input.topicCategory,
  })

  if (error) {
    return { ok: false, error: translateCommunityError(error.message) }
  }

  return { ok: true, id: String(data?.id || '') }
}

export async function resolveCommunityMarket(
  marketId: string,
  winningOption: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('resolve_community_market', {
    p_market_id: marketId,
    p_winning_option: winningOption,
    p_notes: null,
  })

  if (error) {
    return { ok: false, error: translateCommunityError(error.message) }
  }

  return { ok: true }
}

export async function reportCommunityMarket(
  marketId: string,
  reason: string
): Promise<
  | { ok: true; removed: boolean; reportCount: number }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('report_community_market', {
    p_market_id: marketId,
    p_reason: reason,
  })

  if (error) {
    return { ok: false, error: translateCommunityError(error.message) }
  }

  const payload = (data || {}) as {
    removed?: boolean
    report_count?: number
  }

  return {
    ok: true,
    removed: Boolean(payload.removed),
    reportCount: Number(payload.report_count || 0),
  }
}

export function isCommunityMarket(market: {
  category?: string | null
}): boolean {
  const c = (market.category || '').normalize('NFC').trim().toLowerCase()
  return c === 'yhteisö' || c === 'yhteiso'
}

/** Top N community markets by volume (for cross-promoting into topic categories). */
export function topCommunityMarketIds<
  T extends { id: string; category?: string | null; total_volume?: number | null },
>(markets: T[], limit = COMMUNITY_TOP_CROSS_PROMOTE): Set<string> {
  const ranked = markets
    .filter((m) => isCommunityMarket(m))
    .sort(
      (a, b) => Number(b.total_volume || 0) - Number(a.total_volume || 0)
    )
    .slice(0, limit)
  return new Set(ranked.map((m) => m.id))
}

export function topicCategoryOf(market: {
  topic_category?: string | null
  metadata?: Record<string, unknown> | null
}): string | null {
  if (market.topic_category) return String(market.topic_category)
  const meta = market.metadata?.topic_category
  return typeof meta === 'string' && meta.trim() ? meta.trim() : null
}
