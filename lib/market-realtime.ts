import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export function isOpenMarketStatus(status: unknown): boolean {
  const s = String(status ?? 'open').toLowerCase().trim()
  return s === 'open' || s === ''
}

/** Row shape for Realtime — index signature matches supabase `.on<T>` constraint. */
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
  [key: string]: any
}

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

/** Apply a markets postgres_changes event to the open-markets list. */
export function applyMarketChange<T extends { id: string }>(
  prev: T[],
  payload: RealtimePostgresChangesPayload<MarketRow>,
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

  if (!isOpenMarketStatus(row.status)) {
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
