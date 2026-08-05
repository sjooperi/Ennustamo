'use client'

import { useCallback, useEffect, useState } from 'react'
import { Crown, Medal, Trophy, TrendingDown, TrendingUp, X } from 'lucide-react'
import { STARTING_BALANCE } from '@/lib/auth-profile'
import { formatFyrkka } from '@/lib/data'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'
import { supabase } from '@/lib/supabase'

export type LeaderboardRow = {
  id: string
  name: string
  initials: string
  balance: number
  profit: number
}

type LeaderboardModalProps = {
  open: boolean
  onClose: () => void
}

const RANK_STYLES = [
  'bg-[oklch(0.8_0.15_85)] text-[oklch(0.25_0.05_85)]',
  'bg-[oklch(0.78_0.02_260)] text-[oklch(0.25_0.02_260)]',
  'bg-[oklch(0.65_0.11_50)] text-[oklch(0.2_0.05_50)]',
]

type ProfileLeaderboardSource = {
  id: string
  display_name?: string | null
  username?: string | null
  email?: string | null
  balance?: number | string | null
  fyrkat?: number | string | null
}

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const primary = await supabase
    .from('profiles')
    .select('id, display_name, username, email, balance, fyrkat')
    .order('balance', { ascending: false })
    .limit(50)

  let rows: ProfileLeaderboardSource[] | null = primary.data

  if (primary.error) {
    const fallback = await supabase
      .from('profiles')
      .select('id, username, balance, fyrkat')
      .order('fyrkat', { ascending: false })
      .limit(50)

    if (fallback.error) {
      console.error('Failed to load leaderboard:', primary.error.message)
      return []
    }
    rows = (fallback.data ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      balance: row.balance,
      fyrkat: row.fyrkat,
      display_name: null,
      email: null,
    }))
  }

  if (!rows) return []

  return rows
    .map((row) => {
      const balance = Number(row.balance ?? row.fyrkat ?? STARTING_BALANCE)
      const name = resolvePublicName({
        username: typeof row.username === 'string' ? row.username : null,
        displayName: typeof row.display_name === 'string' ? row.display_name : null,
        email: typeof row.email === 'string' ? row.email : null,
      })
      return {
        id: row.id,
        name,
        initials: initialsFromPublicName(name),
        balance,
        profit: balance - STARTING_BALANCE,
      }
    })
    .sort((a, b) => b.balance - a.balance || b.profit - a.profit)
}

export function LeaderboardModal({ open, onClose }: LeaderboardModalProps) {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLeaderboard()
      setRows(data)
    } catch (err) {
      console.error(err)
      setError('Tulostaulukon lataus epäonnistui.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Sulje tulostaulukko"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
        className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <Trophy className="size-5" />
            </span>
            <div>
              <h2 id="leaderboard-title" className="text-base font-semibold">
                Tulostaulukko
              </h2>
              <p className="text-xs text-muted-foreground">
                Järjestys saldon mukaan · lähtö {STARTING_BALANCE} F
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Sulje"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ladataan tulostaulukkoa...
            </p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-[var(--no)]">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ei vielä käyttäjiä tulostaulukossa.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Käyttäjä</th>
                  <th className="pb-2 text-right font-medium">Tulos</th>
                  <th className="pb-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const rank = index + 1
                  const isTop3 = rank <= 3
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border/60 last:border-0 ${
                        isTop3 ? 'bg-secondary/30' : ''
                      }`}
                    >
                      <td className="py-2.5 pr-2 align-middle">
                        {isTop3 ? (
                          <span
                            className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${RANK_STYLES[rank - 1]}`}
                          >
                            {rank === 1 ? (
                              <Crown className="size-3.5" />
                            ) : (
                              <Medal className="size-3.5" />
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex size-7 items-center justify-center text-xs font-semibold text-muted-foreground">
                            {rank}.
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 align-middle">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">
                            {row.initials}
                          </span>
                          <span className="truncate font-medium text-foreground">
                            {row.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-right align-middle">
                        <span
                          className={`inline-flex items-center justify-end gap-0.5 font-mono text-xs font-semibold tabular-nums ${
                            row.profit > 0
                              ? 'text-[var(--yes)]'
                              : row.profit < 0
                                ? 'text-[var(--no)]'
                                : 'text-muted-foreground'
                          }`}
                        >
                          {row.profit > 0 ? (
                            <TrendingUp className="size-3" />
                          ) : row.profit < 0 ? (
                            <TrendingDown className="size-3" />
                          ) : null}
                          {row.profit > 0 ? '+' : ''}
                          {formatFyrkka(Math.round(row.profit))}
                        </span>
                      </td>
                      <td className="py-2.5 text-right align-middle font-mono text-xs font-semibold tabular-nums text-primary">
                        {formatFyrkka(Math.round(row.balance))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
