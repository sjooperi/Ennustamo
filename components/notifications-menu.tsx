'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  fetchNotifications,
  markNotificationsRead,
  unreadCount,
  type AppNotification,
} from '@/lib/notifications'

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diffMin = Math.round((Date.now() - t) / 60000)
  if (diffMin < 1) return 'juuri nyt'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 7) return `${diffD} pv`
  return new Date(iso).toLocaleDateString('fi-FI')
}

export function NotificationsMenu() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const rows = await fetchNotifications(40)
    setItems(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => {
      void load()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = unreadCount(items)

  const handleOpen = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      await load()
      if (unread > 0) {
        await markNotificationsRead()
        setItems((prev) =>
          prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
        )
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative hidden size-9 rounded-xl sm:inline-flex"
        aria-label={unread > 0 ? `Ilmoitukset (${unread} lukematonta)` : 'Ilmoitukset'}
        aria-expanded={open}
        onClick={() => void handleOpen()}
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        ) : null}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="Ilmoitukset"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <p className="text-sm font-semibold">Ilmoitukset</p>
            {loading ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                Ei ilmoituksia vielä.
              </li>
            ) : (
              items.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-border/60 px-3 py-2.5 last:border-b-0 ${
                    n.readAt ? '' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {n.title}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  {n.body ? (
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {n.body}
                    </p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
