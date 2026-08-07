import { supabase } from '@/lib/supabase'

export type AppNotification = {
  id: string
  type: string
  title: string
  body: string | null
  metadata: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

export async function fetchNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, metadata, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('fetchNotifications:', error.message)
    return []
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body ?? null,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }))
}

export async function markNotificationsRead(
  ids?: string[]
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids && ids.length > 0 ? ids : null,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, count: Number(data || 0) }
}

export function unreadCount(notifications: AppNotification[]): number {
  return notifications.filter((n) => !n.readAt).length
}
