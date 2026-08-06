import { supabase } from '@/lib/supabase'

export type AdminMarket = {
  id: string
  title: string
  category: string | null
  end_date: string | null
  created_at?: string
  status: string | null
  winning_option: string | null
  resolved_at: string | null
  resolved_by: string | null
  yes_pool: number
  no_pool: number
}

export type MarketResolution = {
  id: string
  market_id: string
  winning_option: string
  resolved_by: string
  resolved_at: string
  total_payout: number
  winner_count: number
  loser_count: number
  notes: string | null
  rolled_back: boolean
  rolled_back_at: string | null
  rolled_back_by: string | null
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    console.error('is_admin check failed:', error.message)
    return false
  }
  return Boolean(data)
}

function mapAdminMarket(m: {
  id: string
  title: string
  category: string | null
  end_date: string | null
  created_at?: string
  status?: string | null
  winning_option?: string | null
  resolved_at?: string | null
  resolved_by?: string | null
  yes_pool: number | null
  no_pool: number | null
}): AdminMarket {
  return {
    id: m.id,
    title: m.title,
    category: m.category,
    end_date: m.end_date,
    created_at: m.created_at,
    status: m.status ?? 'open',
    winning_option: m.winning_option ?? null,
    resolved_at: m.resolved_at ?? null,
    resolved_by: m.resolved_by ?? null,
    yes_pool: Number(m.yes_pool || 0),
    no_pool: Number(m.no_pool || 0),
  }
}

/** Sort: ended first, then soonest end_date, then title. */
function sortPendingMarkets(markets: AdminMarket[]): AdminMarket[] {
  const now = Date.now()
  return [...markets].sort((a, b) => {
    const aEnd = a.end_date ? new Date(a.end_date).getTime() : null
    const bEnd = b.end_date ? new Date(b.end_date).getTime() : null
    const aEnded = aEnd === null || aEnd <= now
    const bEnded = bEnd === null || bEnd <= now
    if (aEnded !== bEnded) return aEnded ? -1 : 1
    if (aEnd !== null && bEnd !== null && aEnd !== bEnd) return aEnd - bEnd
    if (aEnd === null && bEnd !== null) return 1
    if (aEnd !== null && bEnd === null) return -1
    return a.title.localeCompare(b.title, 'fi')
  })
}

function isOpenStatus(status: string | null | undefined): boolean {
  if (status == null || status === '') return true
  return status.toLowerCase() === 'open'
}

function isResolvedStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === 'resolved'
}

export async function fetchPendingMarkets(): Promise<AdminMarket[]> {
  // DB may store status as OPEN/open — filter case-insensitively on the client
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, category, end_date, created_at, status, winning_option, resolved_at, resolved_by, yes_pool, no_pool'
    )
    .order('end_date', { ascending: true })

  if (error) {
    // Older schema without status / resolution columns
    const fallback = await supabase
      .from('markets')
      .select('id, title, category, end_date, created_at, yes_pool, no_pool')
      .order('end_date', { ascending: true })

    if (fallback.error) {
      throw new Error(fallback.error.message)
    }

    return sortPendingMarkets((fallback.data ?? []).map(mapAdminMarket))
  }

  return sortPendingMarkets(
    (data ?? []).filter((m) => isOpenStatus(m.status)).map(mapAdminMarket)
  )
}

export async function fetchResolvedMarkets(): Promise<AdminMarket[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(
      'id, title, category, end_date, created_at, status, winning_option, resolved_at, resolved_by, yes_pool, no_pool'
    )
    .order('resolved_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('fetchResolvedMarkets:', error.message)
    return []
  }

  return (data ?? [])
    .filter((m) => isResolvedStatus(m.status))
    .slice(0, 30)
    .map(mapAdminMarket)
}

export async function fetchResolutions(marketId?: string): Promise<MarketResolution[]> {
  let q = supabase
    .from('market_resolutions')
    .select('*')
    .order('resolved_at', { ascending: false })
    .limit(50)

  if (marketId) {
    q = q.eq('market_id', marketId)
  }

  const { data, error } = await q
  if (error) {
    console.error('fetchResolutions:', error.message)
    return []
  }

  return (data ?? []).map((r) => ({
    ...r,
    total_payout: Number(r.total_payout || 0),
    winner_count: Number(r.winner_count || 0),
    loser_count: Number(r.loser_count || 0),
  }))
}

export async function resolveMarket(
  marketId: string,
  winningOption: 'YES' | 'NO',
  notes?: string
): Promise<{ ok: true; resolution: MarketResolution } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('resolve_market', {
    p_market_id: marketId,
    p_winning_option: winningOption,
    p_notes: notes || null,
  })

  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }

  return {
    ok: true,
    resolution: {
      ...data,
      total_payout: Number(data.total_payout || 0),
      winner_count: Number(data.winner_count || 0),
      loser_count: Number(data.loser_count || 0),
    },
  }
}

export async function rollbackResolution(
  resolutionId: string,
  notes?: string
): Promise<{ ok: true; resolution: MarketResolution } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('rollback_resolution', {
    p_resolution_id: resolutionId,
    p_notes: notes || null,
  })

  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }

  return {
    ok: true,
    resolution: {
      ...data,
      total_payout: Number(data.total_payout || 0),
      winner_count: Number(data.winner_count || 0),
      loser_count: Number(data.loser_count || 0),
    },
  }
}

export function translateAdminError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään.'
  if (message.includes('FORBIDDEN')) return 'Ei ylläpito-oikeuksia.'
  if (message.includes('MARKET_NOT_FOUND')) return 'Kohdetta ei löytynyt.'
  if (message.includes('ALREADY_RESOLVED')) return 'Kohde on jo ratkaistu.'
  if (message.includes('INVALID_OUTCOME')) return 'Virheellinen lopputulos.'
  if (message.includes('RESOLUTION_NOT_FOUND')) return 'Ratkaisua ei löytynyt.'
  if (message.includes('ALREADY_ROLLED_BACK')) return 'Ratkaisu on jo peruttu.'
  if (message.includes('MARKET_NOT_ACTIVE_RESOLUTION')) {
    return 'Ratkaisu ei ole tämän kohteen aktiivinen ratkaisu.'
  }
  if (message.includes('MARKET_CLOSED')) return 'Kohde on suljettu.'
  return message
}
