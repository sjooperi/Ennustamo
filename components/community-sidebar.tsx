'use client'

import { useEffect, useState } from 'react'
import { Crown, MessageSquare, TrendingUp } from 'lucide-react'
import { LeaderboardModal } from '@/components/leaderboard-modal'
import { MarketWizardBadge } from '@/components/market-wizard-badge'
import { PopularCreatorsPanel } from '@/components/popular-creators-panel'
import { DISCUSSIONS } from '@/lib/data'
import { fetchLeaderboard, type LeaderboardRow } from '@/lib/leaderboard'
import { formatRoi } from '@/lib/roi'

const RANK_STYLES = [
  'bg-[oklch(0.8_0.15_85)] text-[oklch(0.25_0.05_85)]',
  'bg-[oklch(0.78_0.02_260)] text-[oklch(0.25_0.02_260)]',
  'bg-[oklch(0.65_0.11_50)] text-[oklch(0.2_0.05_50)]',
]

export function CommunitySidebar() {
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [top, setTop] = useState<LeaderboardRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await fetchLeaderboard(3)
      if (!cancelled) setTop(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <aside className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-[oklch(0.8_0.15_85)]" />
          <h2 className="text-sm font-semibold">Parhaat ennustajat</h2>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {top.length === 0 ? (
            <li className="text-xs text-muted-foreground">
              Ei vielä tuloksia. Min. 50 vetoa listalle.
            </li>
          ) : (
            top.map((user, index) => {
              const rank = index + 1
              return (
                <li key={user.id} className="flex items-center gap-3">
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${RANK_STYLES[rank - 1] ?? 'bg-secondary text-foreground'}`}
                  >
                    {rank}
                  </span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                    {user.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{user.name}</span>
                      {user.hasMarketWizardBadge ? (
                        <MarketWizardBadge size="md" className="shrink-0" />
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Tulos {user.profit > 0 ? '+' : ''}
                      {Math.round(user.profit)} F
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums ${
                      user.roi >= 0 ? 'text-[var(--yes)]' : 'text-[var(--no)]'
                    }`}
                  >
                    <TrendingUp className="size-3.5" />
                    {formatRoi(user.roi)}
                  </span>
                </li>
              )
            })
          )}
        </ul>
        <button
          type="button"
          onClick={() => setLeaderboardOpen(true)}
          className="mt-4 w-full rounded-xl border border-border bg-secondary/50 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Näytä koko tulostaulukko
        </button>
      </section>

      <PopularCreatorsPanel />

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-5 text-primary" />
          <h2 className="text-sm font-semibold">Kuumimmat keskustelut</h2>
        </div>
        <ul className="mt-4 flex flex-col gap-4">
          {DISCUSSIONS.map((d) => (
            <li key={d.id} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                {d.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{d.author}</span>{' '}
                  · {d.market} · {d.time}
                </p>
                <p className="mt-0.5 text-pretty text-sm leading-snug">{d.comment}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />
    </aside>
  )
}
