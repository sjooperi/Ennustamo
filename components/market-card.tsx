import { CalendarClock, MessageSquare, Sparkles, TrendingUp } from 'lucide-react'
import { type Market, formatFyrkka } from '@/lib/data'

export function MarketCard({ market }: { market: Market }) {
  const noPct = 100 - market.yesPct

  return (
    <article className="group relative flex flex-col rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5">
      {/* Meta row */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <span className="rounded-md bg-secondary px-2 py-0.5 text-foreground">
            {market.category}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" />
            Päättyy {market.closes}
          </span>
        </span>
        {market.sponsored && (
          <span className="inline-flex items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Sparkles className="size-3" />
            Sponsoroitu • {market.sponsored}
          </span>
        )}
      </div>

      {/* Question */}
      <h3 className="mt-3 text-pretty text-base font-semibold leading-snug transition-colors group-hover:text-primary">
        {market.question}
      </h3>

      {/* Probability bar */}
      <div className="mt-auto pt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium">
          <span className="text-[var(--yes)]">{market.yesPct}% KYLLÄ</span>
          <span className="text-[var(--no)]">{noPct}% EI</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-l-full bg-[var(--yes)] transition-all duration-500"
            style={{ width: `${market.yesPct}%` }}
          />
          <div
            className="h-full rounded-r-full bg-[var(--no)] transition-all duration-500"
            style={{ width: `${noPct}%` }}
          />
        </div>

        {/* Action buttons */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--yes)]/12 text-sm font-semibold text-[var(--yes)] ring-1 ring-inset ring-[var(--yes)]/25 transition-all hover:bg-[var(--yes)] hover:text-[var(--yes-foreground)]">
            KYLLÄ {market.yesPct}%
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[var(--no)]/12 text-sm font-semibold text-[var(--no)] ring-1 ring-inset ring-[var(--no)]/25 transition-all hover:bg-[var(--no)] hover:text-[var(--no-foreground)]">
            EI {noPct}%
          </button>
        </div>

        {/* Volume footer */}
        <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-primary" />
            <span className="font-mono tabular-nums text-foreground">
              {formatFyrkka(market.volume)}
            </span>
            Fyrkkaa veikattu
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="size-3.5" />
            <span className="font-mono tabular-nums">{market.comments}</span>
            kommenttia
          </span>
        </div>
      </div>
    </article>
  )
}
