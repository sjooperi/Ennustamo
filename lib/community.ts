import { supabase } from '@/lib/supabase'

export const COMMUNITY_CATEGORY = 'Yhteisö'
export const COMMUNITY_CREATOR_STAKE = 50
export const COMMUNITY_MAX_DAILY = 2
export const COMMUNITY_RESOLVE_HOURS = 48
export const COMMUNITY_REPORT_THRESHOLD = 5

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
  resolutionCriteria: string
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
  if (message.includes('INVALID_OPTIONS')) {
    return 'Lisää vähintään kaksi eri vastausvaihtoehtoa.'
  }
  if (message.includes('INVALID_END_DATE')) {
    return 'Sulkeutumisajan pitää olla tulevaisuudessa.'
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
  const { data, error } = await supabase.rpc('create_community_market', {
    p_title: input.title,
    p_options: input.options,
    p_end_date: input.endDate,
    p_resolution_criteria: input.resolutionCriteria,
    p_stake: COMMUNITY_CREATOR_STAKE,
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
