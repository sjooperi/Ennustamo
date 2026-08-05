import { ArrowRight, PlayCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STATS = [
  { label: 'Avointa markkinaa', value: '248' },
  { label: 'Ennustajaa', value: '31 400' },
  { label: 'Fyrkkaa veikattu', value: '4,2 M' },
]

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_-10%,oklch(0.72_0.14_200/0.18),transparent)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            Täysin ilmainen leikkirahapeli
          </span>

          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Suomen suosituin{' '}
            <span className="text-primary">ennustemarkkina</span>
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Mitä tapahtuu seuraavaksi? Ennusta uutisia, politiikkaa ja urheilua
            leikkirahalla.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              size="lg"
              className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold shadow-lg shadow-primary/20"
            >
              Aloita veikkaus
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold"
            >
              <PlayCircle className="size-4" />
              Miten se toimii?
            </Button>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <dt className="text-xs text-muted-foreground sm:text-sm">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-mono text-xl font-semibold tabular-nums sm:text-2xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
