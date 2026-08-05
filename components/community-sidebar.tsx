import { Crown, MessageSquare, TrendingUp } from 'lucide-react'
import { DISCUSSIONS, LEADERBOARD, formatFyrkka } from '@/lib/data'

const RANK_STYLES = [
  'bg-[oklch(0.8_0.15_85)] text-[oklch(0.25_0.05_85)]', // gold
  'bg-[oklch(0.78_0.02_260)] text-[oklch(0.25_0.02_260)]', // silver
  'bg-[oklch(0.65_0.11_50)] text-[oklch(0.2_0.05_50)]', // bronze
]

export function CommunitySidebar() {
  return (
    <aside className="flex flex-col gap-6">
      {/* Leaderboard */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-[oklch(0.8_0.15_85)]" />
          <h2 className="text-sm font-semibold">
            Kuukauden parhaat ennustajat
          </h2>
        </div>
        <ul className="mt-4 flex flex-col gap-3">
          {LEADERBOARD.map((user) => (
            <li key={user.rank} className="flex items-center gap-3">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${RANK_STYLES[user.rank - 1]}`}
              >
                {user.rank}
              </span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                {user.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.handle}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 font-mono text-sm font-semibold tabular-nums text-[var(--yes)]">
                <TrendingUp className="size-3.5" />+{formatFyrkka(user.profit)}
              </span>
            </li>
          ))}
        </ul>
        <button className="mt-4 w-full rounded-xl border border-border bg-secondary/50 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          Näytä koko tulostaulukko
        </button>
      </section>

      {/* Discussions */}
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
                  <span className="font-medium text-foreground">
                    {d.author}
                  </span>{' '}
                  · {d.market} · {d.time}
                </p>
                <p className="mt-0.5 text-pretty text-sm leading-snug">
                  {d.comment}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
