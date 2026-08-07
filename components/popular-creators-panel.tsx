'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Trophy } from 'lucide-react'
import { MarketWizardBadge } from '@/components/market-wizard-badge'
import {
  fetchCreatorRewardAwards,
  type CreatorRewardPeriodGroup,
} from '@/lib/creator-rewards'
import { formatFyrkka } from '@/lib/data'

const RANK_STYLES = [
  'bg-[oklch(0.8_0.15_85)] text-[oklch(0.25_0.05_85)]',
  'bg-[oklch(0.78_0.02_260)] text-[oklch(0.25_0.02_260)]',
  'bg-[oklch(0.65_0.11_50)] text-[oklch(0.2_0.05_50)]',
]

type Tab = 'week' | 'month'

export function PopularCreatorsPanel() {
  const [tab, setTab] = useState<Tab>('week')
  const [groups, setGroups] = useState<CreatorRewardPeriodGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const rows = await fetchCreatorRewardAwards({
        kind: tab,
        limitPeriods: 6,
        // Include admin test awards so the UI can be verified end-to-end.
        includeTests: true,
      })
      if (!cancelled) {
        setGroups(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab])

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h2 className="text-sm font-semibold">Viikon / kuukauden suositut</h2>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Eniten volyymia keränneiden yhteisökohteiden luojat palkitaan automaattisesti.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-secondary/60 p-1">
        <button
          type="button"
          onClick={() => setTab('week')}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'week'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Viikko
        </button>
        <button
          type="button"
          onClick={() => setTab('month')}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
            tab === 'month'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Kuukausi
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Ladataan…</p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Ei vielä {tab === 'week' ? 'viikon' : 'kuukauden'} voittajia. Lista täyttyy
            automaattisesti palkintojen jaon jälkeen.
          </p>
        ) : (
          groups.map((group) => (
            <div key={`${group.periodKind}:${group.periodStart}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground capitalize">
                  {group.label}
                  {group.awards.some((a) => a.isTest) ? (
                    <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
                      (testi)
                    </span>
                  ) : null}
                </p>
                <Trophy className="size-3.5 text-muted-foreground" />
              </div>
              <ul className="flex flex-col gap-2.5">
                {group.awards.map((award) => (
                  <li key={award.id} className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                        RANK_STYLES[award.rank - 1] ?? 'bg-secondary text-foreground'
                      }`}
                    >
                      {award.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{award.creatorName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {award.marketTitle || 'Yhteisökohde'}
                      </p>
                      {award.badgeGranted ? (
                        <span className="mt-0.5 inline-flex items-center gap-1">
                          <MarketWizardBadge size="sm" />
                          <span className="text-[10px] font-semibold text-[oklch(0.75_0.12_85)]">
                            MV
                          </span>
                        </span>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs font-semibold tabular-nums text-primary">
                        +{formatFyrkka(Math.round(award.rewardAmount))} F
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {formatFyrkka(Math.round(award.volume))} F vol.
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
