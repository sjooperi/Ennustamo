'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { UserBadges } from '@/components/user-badges'
import {
  fetchCreatorRewardAwards,
  type CreatorRewardAward,
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
  const [awards, setAwards] = useState<CreatorRewardAward[]>([])
  const [periodLabel, setPeriodLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const groups = await fetchCreatorRewardAwards({
        kind: tab,
        limitPeriods: 1,
        includeTests: false,
      })
      if (!cancelled) {
        const latest = groups[0]
        setAwards(latest?.awards ?? [])
        setPeriodLabel(latest?.label ?? null)
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
        <h2 className="text-sm font-semibold">Suosituimpien kohteiden luojat</h2>
      </div>

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

      {periodLabel ? (
        <p className="mt-2 text-[11px] text-muted-foreground capitalize">
          {periodLabel}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-xs text-muted-foreground">Ladataan…</p>
      ) : awards.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Ei vielä {tab === 'week' ? 'viikon' : 'kuukauden'} voittajia. Lista
          täyttyy automaattisesti palkintojen jaon jälkeen.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {awards.map((award) => (
            <li key={award.id} className="flex items-center gap-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  RANK_STYLES[award.rank - 1] ?? 'bg-secondary text-foreground'
                }`}
              >
                {award.rank}
              </span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                {award.creatorInitials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{award.creatorName}</span>
                  <UserBadges
                    size="md"
                    isOracle={award.isOracle}
                    isTopPredictor={award.isTopPredictor}
                    hasMarketWizardBadge={award.hasMarketWizardBadge}
                  />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {award.marketTitle || 'Yhteisökohde'}
                </p>
              </div>
              <span className="inline-flex shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
                +{formatFyrkka(Math.round(award.rewardAmount))} F
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
