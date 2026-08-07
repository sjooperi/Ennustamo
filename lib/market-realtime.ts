import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function isOpenMarketStatus(status: unknown): boolean {
  const s = String(status ?? 'open').toLowerCase().trim()
  return s === 'open' || s === ''
}

/** Prefer MLB first-pitch (`metadata.game_start`); fall back to `end_date`. */
export function bettingClosesAtMs(row: {
  end_date?: string | null
  metadata?: Record<string, unknown> | null
}): number | null {
  const meta = row.metadata
  const gameStart =
    meta && typeof meta === 'object' && typeof meta.game_start === 'string'
      ? meta.game_start
      : null
  const raw = gameStart || row.end_date || null
  if (!raw) return null
  const ms = new Date(raw).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** Open for betting: status open AND first pitch / end_date still in the future. */
export function isOpenForBetting(
  row: {
    status?: unknown
    end_date?: string | null
    metadata?: Record<string, unknown> | null
  },
  nowMs: number = Date.now()
): boolean {
  if (!isOpenMarketStatus(row.status)) return false
  const closes = bettingClosesAtMs(row)
  if (closes != null && closes <= nowMs) return false
  return true
}

/** Keep on public list (includes closed community markets awaiting creator resolve). */
export function isListablePublicMarket(row: {
  status?: unknown
  category?: string | null
  end_date?: string | null
  metadata?: Record<string, unknown> | null
}): boolean {
  const status = String(row.status ?? 'open').toLowerCase().trim()
  if (status === 'resolved' || status === 'cancelled' || status === 'disputed' || status === 'removed') {
    return false
  }
  const category = String(row.category || '').toLowerCase()
  if (category === 'yhteisö') {
    return status === 'open' || status === 'closed'
  }
  return isOpenForBetting(row)
}

export type MarketRow = {
  id: string
  title?: string
  category?: string | null
  end_date?: string | null
  created_at?: string | null
  status?: string | null
  yes_pool?: number | null
  no_pool?: number | null
  winning_option?: string | null
  resolved_at?: string | null
  options?: unknown
  option_pools?: unknown
  [key: string]: any
}

/** Default row type Supabase Realtime infers without a generated Database type. */
type RealtimeRow = { [key: string]: any }

export type MarketRealtimePayload = RealtimePostgresChangesPayload<RealtimeRow>

export function asMarketRow(value: unknown): MarketRow | null {
  if (!value || typeof value !== 'object') return null
  const id = (value as { id?: unknown }).id
  if (typeof id !== 'string' || !id) return null
  return value as MarketRow
}

/** Read status from Realtime old/new (may be `{}` on INSERT/DELETE). */
export function readMarketStatus(row: unknown): unknown {
  if (!row || typeof row !== 'object') return undefined
  if (!('status' in row)) return undefined
  return (row as { status?: unknown }).status
}

/**
 * Apply a markets postgres_changes event to the open-markets list.
 * Accepts Supabase's default payload typing; validates rows via asMarketRow.
 */
export function applyMarketChange<T extends { id: string }>(
  prev: T[],
  payload: MarketRealtimePayload,
  mapRow: (row: MarketRow) => T
): T[] {
  const event = payload.eventType

  if (event === 'DELETE') {
    const id = asMarketRow(payload.old)?.id
    if (!id) return prev
    return prev.filter((m) => m.id !== id)
  }

  const row = asMarketRow(payload.new)
  if (!row) return prev

  if (!isListablePublicMarket(row)) {
    return prev.filter((m) => m.id !== row.id)
  }

  const next = mapRow(row)
  const idx = prev.findIndex((m) => m.id === row.id)
  if (idx === -1) {
    return [next, ...prev]
  }

  const copy = prev.slice()
  copy[idx] = { ...prev[idx], ...next }
  return copy
}
