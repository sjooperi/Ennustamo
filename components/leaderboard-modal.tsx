'use client'

import { useCallback, useEffect, useState } from 'react'
import { Crown, Medal, Trophy, TrendingDown, TrendingUp, X } from 'lucide-react'
import { UserBadges } from '@/components/user-badges'
import { formatFyrkka } from '@/lib/data'
import {
  fetchAllTimeLeaderboard,
  fetchMonthlyLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardRow,
} from '@/lib/leaderboard'
import {
  formatTuotto,
  LEADERBOARD_MIN_BETS_ALLTIME,
  LEADERBOARD_MIN_BETS_MONTHLY,
  LEADERBOARD_TOP_N,
  LEADERBOARD_VOLUME_EXPONENT,
} from '@/lib/roi'

export type { LeaderboardRow }

type LeaderboardModalProps = {
  open: boolean
  onClose: () => void
}

const RANK_STYLES = [
  'bg-[oklch(0.8_0.15_85)] text-[oklch(0.25_0.05_85)]',
  'bg-[oklch(0.78_0.02_260)] text-[oklch(0.25_0.02_260)]',
  'bg-[oklch(0.65_0.11_50)] text-[oklch(0.2_0.05_50)]',
]

function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <table className="w-full max-w-full table-fixed text-left text-sm">
      <thead>
        <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
          <th className="w-10 pb-2 font-medium">#</th>
          <th className="pb-2 font-medium">Käyttäjä</th>
          <th className="w-[4.25rem] pb-2 text-right font-medium sm:w-[4.75rem]">
            Tuotto
          </th>
          <th className="w-[4.25rem] pb-2 text-right font-medium sm:w-[4.75rem]">
            Tulos
          </th>
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
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-semibold sm:size-8 sm:text-xs">
                    {row.initials}
                  </span>
                  <div className="min-w-0">
                            <p className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                              <span className="truncate">{row.name}</span>
                              <UserBadges
                                size="md"
                                isOracle={row.isOracle}
                                isTopPredictor={row.isTopPredictor}
                                hasMarketWizardBadge={row.hasMarketWizardBadge}
                              />
                            </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {row.totalBets > 0
                        ? `${row.totalBets} vetoa · ${formatFyrkka(Math.round(row.totalStaked))} F`
                        : `Panostettu ${formatFyrkka(Math.round(row.totalStaked))} F`}
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-2.5 pr-1 text-right align-middle">
                <span
                  className={`inline-flex max-w-full items-center justify-end gap-0.5 truncate font-mono text-[10px] font-bold tabular-nums sm:text-xs ${
                    row.tuotto > 0
                      ? 'text-[var(--yes)]'
                      : row.tuotto < 0
                        ? 'text-[var(--no)]'
                        : 'text-muted-foreground'
                  }`}
                >
                  {row.tuotto > 0 ? (
                    <TrendingUp className="size-3 shrink-0" />
                  ) : row.tuotto < 0 ? (
                    <TrendingDown className="size-3 shrink-0" />
                  ) : null}
                  {formatTuotto(row.tuotto)}
                </span>
              </td>
              <td className="truncate py-2.5 text-right align-middle font-mono text-[10px] font-semibold tabular-nums sm:text-xs">
                <span
                  className={
                    row.profit > 0
                      ? 'text-[var(--yes)]'
                      : row.profit < 0
                        ? 'text-[var(--no)]'
                        : 'text-muted-foreground'
                  }
                >
                  {row.profit > 0 ? '+' : ''}
                  {formatFyrkka(Math.round(row.profit))}
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function LeaderboardModal({ open, onClose }: LeaderboardModalProps) {
  const [tab, setTab] = useState<LeaderboardPeriod>('month')
  const [monthly, setMonthly] = useState<LeaderboardRow[]>([])
  const [alltime, setAlltime] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, a] = await Promise.all([
        fetchMonthlyLeaderboard(LEADERBOARD_TOP_N),
        fetchAllTimeLeaderboard(LEADERBOARD_TOP_N),
      ])
      setMonthly(m)
      setAlltime(a)
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

  const rows = tab === 'month' ? monthly : alltime
  const periodLabel = monthly[0]?.periodLabel
  const minBets =
    tab === 'month' ? LEADERBOARD_MIN_BETS_MONTHLY : LEADERBOARD_MIN_BETS_ALLTIME

  return (
    <div className="fixed inset-0 z-[100] flex max-h-[100dvh] items-center justify-center overflow-hidden p-4">
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
        className="relative z-10 flex max-h-[min(85dvh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Trophy className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id="leaderboard-title" className="text-base font-semibold">
                Tulostaulukko
              </h2>
              <p className="text-xs leading-snug text-muted-foreground">
                Pisteet: tuotto-% × vetoja^{LEADERBOARD_VOLUME_EXPONENT}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Sulje"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/60 p-1">
            <button
              type="button"
              onClick={() => setTab('month')}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'month'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Tämä kuukausi
            </button>
            <button
              type="button"
              onClick={() => setTab('alltime')}
              className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                tab === 'alltime'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Kaikkien aikojen
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {tab === 'month' ? (
              <>
                {periodLabel ? `${periodLabel}. ` : null}
                Min. {minBets} vetoa kuussa. Top {LEADERBOARD_TOP_N}. Ykkönen
                saa badgen Kuukauden ennustaja.
              </>
            ) : (
              <>
                Min. {minBets} ratkaistua vetoa. Top {LEADERBOARD_TOP_N}.
                Ykkönen saa badgen Kaikkien aikojen ennustaja.
              </>
            )}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ladataan tulostaulukkoa...
            </p>
          ) : error ? (
            <p className="py-10 text-center text-sm text-[var(--no)]">{error}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {tab === 'month'
                ? `Ei vielä tuloksia tältä kuulta. Tarvitset vähintään ${minBets} vetoa.`
                : `Ei vielä tuloksia. Tarvitset vähintään ${minBets} ratkaistua vetoa.`}
            </p>
          ) : (
            <LeaderboardTable rows={rows} />
          )}
        </div>
      </div>
    </div>
  )
}
