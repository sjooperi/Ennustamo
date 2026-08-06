'use client'

import { useState } from 'react'
import { LineChart, X } from 'lucide-react'
import {
  formatPct,
  formatShares,
  getOptionPrices,
  getPrices,
  isBinaryMarket,
  quoteFixedOdds,
  toDisplayShares,
  type MarketOptionDef,
} from '@/lib/amm'
import { getPriceChange, type ChartSeries, type PricePoint } from '@/lib/price-history'
import { MarketPriceChart } from '@/components/market-price-chart'

export type LiveMarket = {
  id: string
  title: string
  category: string
  end_date: string
  yes_pool: number
  no_pool: number
  status?: string | null
  winning_option?: string | null
  options?: MarketOptionDef[]
  option_pools?: Record<string, number>
}

export type UserPosition = {
  choice: string
  amount: number
  shares: number
}

const STAKE_PRESETS = [10, 25, 50, 100]

const OPTION_STYLES = [
  {
    text: 'text-[var(--yes)]',
    bg: 'bg-[var(--yes)]',
    soft: 'bg-[var(--yes)]/18',
    ring: 'ring-[var(--yes)]',
    softRing: 'ring-[var(--yes)]/35',
    fg: 'text-[var(--yes-foreground)]',
  },
  {
    text: 'text-[var(--no)]',
    bg: 'bg-[var(--no)]',
    soft: 'bg-[var(--no)]/28',
    ring: 'ring-[var(--no)]',
    softRing: 'ring-[var(--no)]/55',
    fg: 'text-[var(--no-foreground)]',
  },
  {
    text: 'text-primary',
    bg: 'bg-primary',
    soft: 'bg-primary/12',
    ring: 'ring-primary',
    softRing: 'ring-primary/25',
    fg: 'text-primary-foreground',
  },
  {
    text: 'text-foreground',
    bg: 'bg-foreground',
    soft: 'bg-secondary',
    ring: 'ring-foreground',
    softRing: 'ring-border',
    fg: 'text-background',
  },
]

function optionStyle(index: number) {
  return OPTION_STYLES[index % OPTION_STYLES.length]
}

export type MarketCardProps = {
  market: LiveMarket
  priceHistory: PricePoint[]
  chartSeries: ChartSeries[]
  stake: number
  balance: number
  positions: UserPosition[]
  isBetting: boolean
  isLoggedIn: boolean
  onStakeChange: (value: number) => void
  onBet: (choice: string) => void
  onLogin: () => void
}

export function MarketCard({
  market,
  priceHistory,
  chartSeries,
  stake,
  balance,
  positions,
  isBetting,
  isLoggedIn,
  onStakeChange,
  onBet,
  onLogin,
}: MarketCardProps) {
  const [showChart, setShowChart] = useState(true)
  const [pendingChoice, setPendingChoice] = useState<string | null>(null)

  const options: MarketOptionDef[] =
    market.options && market.options.length >= 2
      ? market.options.map((o) => ({
          key: o.key.toUpperCase(),
          label: o.label,
        }))
      : [
          { key: 'YES', label: 'Kyllä' },
          { key: 'NO', label: 'Ei' },
        ]

  const binary = isBinaryMarket(options)
  const yesPool = Number(market.yes_pool || 0)
  const noPool = Number(market.no_pool || 0)
  const binaryPrices = getPrices(yesPool, noPool)
  const multiPrices = getOptionPrices(options, market.option_pools)

  const prices: Record<string, number> = binary
    ? { YES: binaryPrices.yesPrice, NO: binaryPrices.noPrice }
    : multiPrices

  const { deltaPct, direction } = getPriceChange(priceHistory)
  const leading = [...options].sort(
    (a, b) => (prices[b.key] ?? 0) - (prices[a.key] ?? 0)
  )[0]
  const leadingPct = Math.round((prices[leading?.key] ?? 0) * 100)

  const spentByChoice = (key: string) =>
    positions
      .filter((p) => p.choice.toUpperCase() === key.toUpperCase())
      .reduce((sum, p) => sum + p.amount, 0)

  const sharesByChoice = (key: string) =>
    positions
      .filter((p) => p.choice.toUpperCase() === key.toUpperCase())
      .reduce((sum, p) => sum + p.shares, 0)

  const currentPosition = pendingChoice ? spentByChoice(pendingChoice) : 0
  const currentSharesDisplay = toDisplayShares(
    pendingChoice ? sharesByChoice(pendingChoice) : 0
  )
  const draftPot = stake
  const canAfford = draftPot > 0 && draftPot <= balance
  const projectedPosition = currentPosition + (canAfford ? draftPot : 0)
  const balanceAfter = canAfford ? balance - draftPot : balance

  const spotPrice = pendingChoice ? prices[pendingChoice.toUpperCase()] ?? 0 : 0
  const oddsQuote = pendingChoice ? quoteFixedOdds(spotPrice, draftPot) : null
  const pendingLabel =
    options.find((o) => o.key === pendingChoice)?.label ?? pendingChoice ?? ''
  const pendingStyle = optionStyle(
    Math.max(
      0,
      options.findIndex((o) => o.key === pendingChoice)
    )
  )

  const stakePanelOpen = pendingChoice !== null
  const hasPositions = positions.some((p) => p.amount > 0)

  const accumulateToPot = (delta: number) => {
    if (!(delta > 0)) return
    const next = Math.min(Math.floor(balance), draftPot + delta)
    onStakeChange(next)
  }

  const setDraftPot = (value: number) => {
    onStakeChange(Math.max(0, Math.min(Math.floor(balance), value)))
  }

  const openStakePanel = (choice: string) => {
    if (!isLoggedIn) {
      onLogin()
      return
    }
    const key = choice.toUpperCase()
    if (pendingChoice === key) {
      setPendingChoice(null)
      return
    }
    onStakeChange(0)
    setPendingChoice(key)
  }

  const handleConfirmPot = () => {
    if (!pendingChoice || !canAfford || isBetting) return
    onBet(pendingChoice)
  }

  return (
    <article className="flex w-full max-w-full flex-col overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-medium text-foreground">
            {market.category || 'Yleinen'}
          </span>
          <span className="truncate">
            Päättyy{' '}
            {market.end_date
              ? new Date(market.end_date).toLocaleDateString('fi-FI')
              : 'Avoin'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowChart((open) => !open)}
          aria-pressed={showChart}
          className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
            showChart
              ? 'bg-primary/15 text-primary'
              : 'hover:bg-secondary hover:text-foreground'
          }`}
        >
          <LineChart className="size-3" />
          Graafi
        </button>
      </div>

      <h3 className="mt-1.5 text-pretty break-words text-sm font-semibold leading-snug text-foreground">
        {market.title}
      </h3>

      {binary ? (
        <div className="mt-2">
          <div className="mb-1 grid grid-cols-2 items-center gap-2 text-[11px] font-semibold">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--yes)]">
              <span className="tabular-nums text-sm font-bold">
                {Math.round((prices.YES ?? 0) * 100)}%
              </span>
              <span className="truncate">
                {options.find((o) => o.key === 'YES')?.label ?? 'Kyllä'}
              </span>
              {deltaPct !== 0 && (
                <span className="shrink-0 font-medium opacity-80">
                  {direction === 'up' ? '▲' : '▼'}
                  {Math.abs(deltaPct)}%
                </span>
              )}
            </span>
            <span className="inline-flex min-w-0 items-center justify-end gap-1.5 text-[var(--no)]">
              <span className="tabular-nums text-sm font-bold">
                {Math.round((prices.NO ?? 0) * 100)}%
              </span>
              <span className="truncate">
                {options.find((o) => o.key === 'NO')?.label ?? 'Ei'}
              </span>
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-[var(--yes)] transition-all duration-500"
              style={{ width: `${Math.round((prices.YES ?? 0) * 100)}%` }}
            />
            <div
              className="h-full bg-[var(--no)] transition-all duration-500"
              style={{ width: `${Math.round((prices.NO ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            Suosikki:{' '}
            <span className="font-semibold text-foreground">
              {leading?.label} {leadingPct}%
            </span>
          </p>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            {options.map((opt, index) => {
              const pct = Math.round((prices[opt.key] ?? 0) * 100)
              const style = optionStyle(index)
              return (
                <div
                  key={opt.key}
                  className={`h-full ${style.bg} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  title={`${opt.label} ${pct}%`}
                />
              )
            })}
          </div>
        </div>
      )}

      {showChart && (
        <MarketPriceChart
          points={priceHistory}
          series={chartSeries}
          className="mt-2"
        />
      )}

      {hasPositions && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Positiosi:{' '}
          {options
            .map((opt) => {
              const spent = spentByChoice(opt.key)
              const shares = sharesByChoice(opt.key)
              if (!(spent > 0)) return null
              return (
                <span key={opt.key} className="mr-2 font-semibold text-foreground">
                  {spent} F {opt.label}
                  {shares > 0
                    ? ` (${formatShares(toDisplayShares(shares))} os.)`
                    : ''}
                </span>
              )
            })
            .filter(Boolean)}
        </p>
      )}

      <div
        className={`mt-2 grid w-full max-w-full gap-1.5 ${
          options.length <= 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        {options.map((opt, index) => {
          const style = optionStyle(index)
          const selected = pendingChoice === opt.key
          const price = prices[opt.key] ?? 0
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => openStakePanel(opt.key)}
              aria-pressed={selected}
              className={`inline-flex h-9 min-w-0 items-center justify-center gap-1.5 truncate rounded-lg px-2 text-xs font-semibold ring-1 ring-inset transition-all ${
                selected
                  ? `${style.bg} ${style.fg} ${style.ring}`
                  : `${style.soft} ${style.text} ${style.softRing} hover:brightness-110`
              }`}
            >
              <span className="tabular-nums">{formatPct(price)}</span>
              <span className="truncate">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {stakePanelOpen && pendingChoice && (
        <div className="mt-2 w-full max-w-full space-y-2 overflow-hidden rounded-lg border border-border bg-secondary/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-foreground">
              Lisää panosta{' '}
              <span className={pendingStyle.text}>{pendingLabel}</span>
            </p>
            <button
              type="button"
              onClick={() => setPendingChoice(null)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Sulje panosnäkymä"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <p className="text-muted-foreground">
              Positio:{' '}
              <span className={`font-semibold tabular-nums ${pendingStyle.text}`}>
                {currentPosition.toLocaleString('fi-FI')} F
              </span>
              {currentSharesDisplay > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {formatShares(currentSharesDisplay)} os.
                </span>
              )}
            </p>
            <p className="text-right text-muted-foreground">
              Saldo:{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {Math.round(balance).toLocaleString('fi-FI')} F
              </span>
            </p>
            <p className="col-span-2 text-muted-foreground">
              Potti:{' '}
              <span className="text-base font-bold tabular-nums text-foreground">
                {draftPot.toLocaleString('fi-FI')} F
              </span>
              {canAfford && currentPosition > 0 && (
                <span>
                  {' '}
                  → yhteensä{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {projectedPosition.toLocaleString('fi-FI')} F
                  </span>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {STAKE_PRESETS.map((preset) => {
              const wouldExceed = draftPot + preset > balance
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => accumulateToPot(preset)}
                  disabled={wouldExceed || isBetting}
                  aria-label={`Lisää ${preset} Fyrkkaa pottiin`}
                  className="h-7 flex-1 rounded-md bg-secondary text-[11px] font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 active:bg-primary active:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  +{preset}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setDraftPot(0)}
              disabled={draftPot === 0}
              className="h-7 rounded-md bg-secondary px-2 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              aria-label="Nollaa potti"
            >
              0
            </button>
          </div>

          <input
            type="number"
            min={0}
            step={1}
            max={balance}
            value={draftPot}
            onChange={(e) => setDraftPot(Number(e.target.value) || 0)}
            aria-label="Potin summa"
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-[11px] tabular-nums text-foreground focus:border-primary focus:outline-none"
          />

          {oddsQuote && canAfford && (
            <div className="space-y-1 rounded-md border border-border/80 bg-background/50 px-2.5 py-2 text-[11px]">
              <p className="text-muted-foreground">
                Hinta{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {oddsQuote.pricePerShare.toLocaleString('fi-FI', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  F/osake
                </span>
              </p>
              <p className="text-foreground">
                Ostat{' '}
                <span className="font-semibold tabular-nums">
                  {formatShares(oddsQuote.shares)}
                </span>{' '}
                osaketta
              </p>
              <p className="text-muted-foreground">
                Mahdollinen palautus:{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {Math.round(oddsQuote.payout).toLocaleString('fi-FI')} Fyrkkaa
                </span>
              </p>
              <p
                className={
                  oddsQuote.profit >= 0 ? 'text-[var(--yes)]' : 'text-[var(--no)]'
                }
              >
                Puhdas voitto:{' '}
                <span className="font-semibold tabular-nums">
                  {oddsQuote.profit >= 0 ? '+' : ''}
                  {Math.round(oddsQuote.profit).toLocaleString('fi-FI')} Fyrkkaa
                </span>
              </p>
              <p className="text-muted-foreground">
                Saldoon jää{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {Math.round(balanceAfter).toLocaleString('fi-FI')} F
                </span>
              </p>
            </div>
          )}

          {!canAfford && draftPot > balance && (
            <p className="text-[11px] text-[var(--no)]">
              Saldo ei riitä (potti {draftPot.toLocaleString('fi-FI')} F, saldo{' '}
              {Math.round(balance).toLocaleString('fi-FI')} F).
            </p>
          )}

          <button
            type="button"
            onClick={handleConfirmPot}
            disabled={isBetting || !canAfford}
            className={`inline-flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pendingStyle.bg} ${pendingStyle.fg} hover:opacity-90`}
          >
            {isBetting
              ? 'Lisätään...'
              : `Vahvista ${draftPot.toLocaleString('fi-FI')} F ${pendingLabel}`}
          </button>
        </div>
      )}
    </article>
  )
}
