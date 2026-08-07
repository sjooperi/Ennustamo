import { supabase } from '@/lib/supabase'
import { parseMarketOptions, type MarketOptionDef } from '@/lib/amm'

export type MarketOption = MarketOptionDef

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
  options: MarketOption[]
}

export type MarketResolution = {
  id: string
  market_id: string
  winning_option: string
  resolved_by: string | null
  resolved_at: string
  total_payout: number
  winner_count: number
  loser_count: number
  notes: string | null
  rolled_back: boolean
  rolled_back_at: string | null
  rolled_back_by: string | null
}

export type CreateMarketInput = {
  title: string
  options: string[]
  category?: string | null
  endDate?: string | null
}

export type UpdateMarketInput = CreateMarketInput & {
  id: string
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    console.error('is_admin check failed:', error.message)
    return false
  }
  return Boolean(data)
}

export function defaultMarketOptions(): MarketOption[] {
  return [
    { key: 'YES', label: 'Kyllä' },
    { key: 'NO', label: 'Ei' },
  ]
}

// parseMarketOptions lives in lib/amm — re-export for admin callers
export { parseMarketOptions } from '@/lib/amm'

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
  options?: unknown
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
    options: parseMarketOptions(m.options),
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

function isPendingResolutionStatus(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase()
  return s === 'open' || s === 'closed' || s === ''
}

function isResolvedStatus(status: string | null | undefined): boolean {
  return (status || '').toLowerCase() === 'resolved'
}

const MARKET_SELECT =
  'id, title, category, end_date, created_at, status, winning_option, resolved_at, resolved_by, yes_pool, no_pool, options'

export async function fetchPendingMarkets(): Promise<AdminMarket[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(MARKET_SELECT)
    .order('end_date', { ascending: true })

  if (error) {
    const fallback = await supabase
      .from('markets')
      .select(
        'id, title, category, end_date, created_at, status, winning_option, resolved_at, resolved_by, yes_pool, no_pool'
      )
      .order('end_date', { ascending: true })

    if (fallback.error) {
      throw new Error(fallback.error.message)
    }

    return sortPendingMarkets(
      (fallback.data ?? [])
        .filter((m) => isPendingResolutionStatus(m.status))
        .map(mapAdminMarket)
    )
  }

  return sortPendingMarkets(
    (data ?? []).filter((m) => isPendingResolutionStatus(m.status)).map(mapAdminMarket)
  )
}

export async function fetchResolvedMarkets(): Promise<AdminMarket[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(MARKET_SELECT)
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

export async function createMarket(
  input: CreateMarketInput
): Promise<{ ok: true; market: AdminMarket } | { ok: false; error: string }> {
  const labels = input.options.map((o) => o.trim()).filter(Boolean)
  const { data, error } = await supabase.rpc('admin_create_market', {
    p_title: input.title.trim(),
    p_options: labels,
    p_category: input.category?.trim() || null,
    p_end_date: input.endDate || null,
  })

  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }

  return { ok: true, market: mapAdminMarket(data) }
}

export async function updateMarket(
  input: UpdateMarketInput
): Promise<{ ok: true; market: AdminMarket } | { ok: false; error: string }> {
  const labels = input.options.map((o) => o.trim()).filter(Boolean)
  const { data, error } = await supabase.rpc('admin_update_market', {
    p_market_id: input.id,
    p_title: input.title.trim(),
    p_options: labels,
    p_category: input.category?.trim() || null,
    p_end_date: input.endDate || null,
  })

  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }

  return { ok: true, market: mapAdminMarket(data) }
}

export async function deleteMarket(
  marketId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('admin_delete_market', {
    p_market_id: marketId,
  })

  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }

  return { ok: true }
}

export async function resolveMarket(
  marketId: string,
  winningOption: string,
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

/** Auto-resolve finished sports (MLB) from official results + pay winners. */
export async function resolveSportsMarkets(): Promise<
  | { ok: true; resolved: number; pending: number; failed: number }
  | { ok: false; error: string }
> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    return { ok: false, error: 'Kirjaudu sisään.' }
  }

  try {
    const res = await fetch('/api/admin/resolve-sports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json().catch(() => ({}))) as {
      error?: string
      resolved?: number
      pending?: number
      failed?: number
    }
    if (!res.ok) {
      return { ok: false, error: body.error || `Virhe ${res.status}` }
    }
    return {
      ok: true,
      resolved: Number(body.resolved || 0),
      pending: Number(body.pending || 0),
      failed: Number(body.failed || 0),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Urheilukohteiden ratkaisu epäonnistui',
    }
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

export function optionLabel(
  market: Pick<AdminMarket, 'options'>,
  key: string | null | undefined
): string {
  if (!key) return '—'
  const found = market.options.find((o) => o.key.toUpperCase() === key.toUpperCase())
  if (found) return found.label
  if (key.toUpperCase() === 'YES') return 'Kyllä'
  if (key.toUpperCase() === 'NO') return 'Ei'
  return key
}

export async function runAdminCreatorRewardsTest(): Promise<
  { ok: true; credited: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('admin_test_creator_rewards')
  if (error) {
    return { ok: false, error: translateAdminError(error.message) }
  }
  const payload = (data || {}) as { credited?: number }
  return { ok: true, credited: Number(payload.credited || 0) }
}

export function translateAdminError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään.'
  if (message.includes('FORBIDDEN')) return 'Ei ylläpito-oikeuksia.'
  if (message.includes('MARKET_NOT_FOUND')) return 'Kohdetta ei löytynyt.'
  if (message.includes('ALREADY_RESOLVED')) return 'Kohde on jo ratkaistu.'
  if (message.includes('INVALID_OUTCOME')) return 'Virheellinen lopputulos.'
  if (message.includes('INVALID_TITLE')) return 'Kirjoita vähintään 3 merkin kysymys.'
  if (message.includes('INVALID_OPTIONS')) {
    return 'Lisää vähintään kaksi eri vastausvaihtoehtoa.'
  }
  if (message.includes('OPTIONS_LOCKED')) {
    return 'Kohteella on jo vetoja — vaihtoehtojen määrää ei voi muuttaa. Voit silti nimetä vaihtoehdot uudelleen.'
  }
  if (message.includes('RESOLUTION_NOT_FOUND')) return 'Ratkaisua ei löytynyt.'
  if (message.includes('ALREADY_ROLLED_BACK')) return 'Ratkaisu on jo peruttu.'
  if (message.includes('MARKET_NOT_ACTIVE_RESOLUTION')) {
    return 'Ratkaisu ei ole tämän kohteen aktiivinen ratkaisu.'
  }
  if (message.includes('MARKET_CLOSED')) return 'Kohde on suljettu tai ratkaistu — muokkaus ei ole mahdollista.'
  if (
    message.includes('admin_update_market') ||
    message.includes('admin_create_market') ||
    message.includes('admin_test_creator_rewards') ||
    message.includes('Could not find')
  ) {
    return 'Toiminto puuttuu tietokannasta. Aja migraatiot (viimeisin: 026).'
  }
  return message
}
