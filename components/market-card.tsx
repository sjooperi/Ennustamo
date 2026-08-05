'use client'

import { useState } from 'react'
import { LineChart, X } from 'lucide-react'
import { formatPct, formatShares, getPrices, quoteFixedOdds, toDisplayShares } from '@/lib/amm'
import { getPriceChange, type PricePoint } from '@/lib/price-history'
import { MarketPriceChart } from '@/components/market-price-chart'

type BetChoice = 'YES' | 'NO'

export type LiveMarket = {
  id: string
  title: string
  category: string
  end_date: string
  yes_pool: number
  no_pool: number
}

export type UserPosition = {
  choice: BetChoice
  amount: number
  shares: number
}

const STAKE_PRESETS = [10, 25, 50, 100]

export type MarketCardProps = {
  market: LiveMarket
  priceHistory: PricePoint[]
  stake: number
  balance: number
  positions: UserPosition[]
  isBetting: boolean
  isLoggedIn: boolean
  onStakeChange: (value: number) => void
  onBet: (choice: BetChoice) => void
  onLogin: () => void
}

export function MarketCard({
  market,
  priceHistory,
  stake,
  balance,
  positions,
  isBetting,
  isLoggedIn,
  onStakeChange,
  onBet,
  onLogin,
}: MarketCardProps) {
  const [showChart, setShowChart] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<BetChoice | null>(null)

  const yesPool = Number(market.yes_pool || 0)
  const noPool = Number(market.no_pool || 0)
  const { yesPrice, noPrice } = getPrices(yesPool, noPool)
  const yesPercent = Math.round(yesPrice * 100)
  const noPercent = Math.round(noPrice * 100)
  const { deltaPct, direction } = getPriceChange(priceHistory)

  const spentYes = positions
    .filter((p) => p.choice === 'YES')
    .reduce((sum, p) => sum + p.amount, 0)
  const spentNo = positions
    .filter((p) => p.choice === 'NO')
    .reduce((sum, p) => sum + p.amount, 0)
  const sharesYes = positions
    .filter((p) => p.choice === 'YES')
    .reduce((sum, p) => sum + p.shares, 0)
  const sharesNo = positions
    .filter((p) => p.choice === 'NO')
    .reduce((sum, p) => sum + p.shares, 0)

  const currentPosition =
    pendingChoice === 'YES' ? spentYes : pendingChoice === 'NO' ? spentNo : 0
  const currentSharesDisplay = toDisplayShares(
    pendingChoice === 'YES' ? sharesYes : pendingChoice === 'NO' ? sharesNo : 0
  )
  // Draft pot: accumulates with each preset click (50 + 50 = 100), confirmed separately.
  const draftPot = stake
  const canAfford = draftPot > 0 && draftPot <= balance
  const projectedPosition = currentPosition + (canAfford ? draftPot : 0)
  const balanceAfter = canAfford ? balance - draftPot : balance

  const spotPrice = pendingChoice === 'YES' ? yesPrice : pendingChoice === 'NO' ? noPrice : 0
  const oddsQuote = pendingChoice ? quoteFixedOdds(spotPrice, draftPot) : null

  const stakePanelOpen = pendingChoice !== null

  /** Add delta to the draft pot (capped by balance). Does not place a bet. */
  const accumulateToPot = (delta: number) => {
    if (!(delta > 0)) return
    const next = Math.min(Math.floor(balance), draftPot + delta)
    onStakeChange(next)
  }

  const setDraftPot = (value: number) => {
    onStakeChange(Math.max(0, Math.min(Math.floor(balance), value)))
  }

  const openStakePanel = (choice: BetChoice) => {
    if (!isLoggedIn) {
      onLogin()
      return
    }
    if (pendingChoice === choice) {
      setPendingChoice(null)
      return
    }
    // Start a fresh accumulating pot when opening / switching side.
    onStakeChange(0)
    setPendingChoice(choice)
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

      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
          <span className="inline-flex items-center gap-1 text-[var(--yes)]">
            <span className="tabular-nums text-sm font-bold">{yesPercent}%</span>
            KYLLÄ
            {deltaPct !== 0 && (
              <span className="font-medium opacity-70">
                {direction === 'up' ? '▲' : '▼'}
                {Math.abs(deltaPct)}%
              </span>
            )}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--no)]">
            EI
            <span className="tabular-nums text-sm font-bold">{noPercent}%</span>
          </span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-[var(--yes)] transition-all duration-500"
            style={{ width: `${yesPercent}%` }}
          />
          <div
            className="h-full bg-[var(--no)] transition-all duration-500"
            style={{ width: `${noPercent}%` }}
          />
        </div>
      </div>

      {showChart && <MarketPriceChart points={priceHistory} className="mt-2" />}

      {(spentYes > 0 || spentNo > 0) && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground">
          Positiosi:{' '}
          {spentYes > 0 && (
            <span className="font-semibold text-[var(--yes)]">
              {spentYes} Fyrkkaa KYLLÄ
              {sharesYes > 0
                ? ` (${formatShares(toDisplayShares(sharesYes))} os.)`
                : ''}
            </span>
          )}
          {spentYes > 0 && spentNo > 0 && ' · '}
          {spentNo > 0 && (
            <span className="font-semibold text-[var(--no)]">
              {spentNo} Fyrkkaa EI
              {sharesNo > 0
                ? ` (${formatShares(toDisplayShares(sharesNo))} os.)`
                : ''}
            </span>
          )}
        </p>
      )}

      <div className="mt-2 grid w-full max-w-full grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => openStakePanel('YES')}
          aria-pressed={pendingChoice === 'YES'}
          className={`inline-flex h-8 min-w-0 items-center justify-center truncate rounded-lg px-1 text-xs font-semibold ring-1 ring-inset transition-all ${
            pendingChoice === 'YES'
              ? 'bg-[var(--yes)] text-[var(--yes-foreground)] ring-[var(--yes)]'
              : 'bg-[var(--yes)]/12 text-[var(--yes)] ring-[var(--yes)]/25 hover:bg-[var(--yes)] hover:text-[var(--yes-foreground)]'
          }`}
        >
          KYLLÄ {formatPct(yesPrice)}
        </button>
        <button
          type="button"
          onClick={() => openStakePanel('NO')}
          aria-pressed={pendingChoice === 'NO'}
          className={`inline-flex h-8 min-w-0 items-center justify-center truncate rounded-lg px-1 text-xs font-semibold ring-1 ring-inset transition-all ${
            pendingChoice === 'NO'
              ? 'bg-[var(--no)] text-[var(--no-foreground)] ring-[var(--no)]'
              : 'bg-[var(--no)]/12 text-[var(--no)] ring-[var(--no)]/25 hover:bg-[var(--no)] hover:text-[var(--no-foreground)]'
          }`}
        >
          EI {formatPct(noPrice)}
        </button>
      </div>

      {stakePanelOpen && pendingChoice && (
        <div className="mt-2 w-full max-w-full space-y-2 overflow-hidden rounded-lg border border-border bg-secondary/40 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-foreground">
              Lisää panosta{' '}
              <span
                className={
                  pendingChoice === 'YES' ? 'text-[var(--yes)]' : 'text-[var(--no)]'
                }
              >
                {pendingChoice === 'YES' ? 'KYLLÄ' : 'EI'}
              </span>
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
              <span
                className={`font-semibold tabular-nums ${
                  pendingChoice === 'YES' ? 'text-[var(--yes)]' : 'text-[var(--no)]'
                }`}
              >
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
            className={`inline-flex h-8 w-full items-center justify-center rounded-lg text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              pendingChoice === 'YES'
                ? 'bg-[var(--yes)] text-[var(--yes-foreground)] hover:opacity-90'
                : 'bg-[var(--no)] text-[var(--no-foreground)] hover:opacity-90'
            }`}
          >
            {isBetting
              ? 'Lisätään...'
              : `Vahvista ${draftPot.toLocaleString('fi-FI')} F ${
                  pendingChoice === 'YES' ? 'KYLLÄ' : 'EI'
                }`}
          </button>
        </div>
      )}
    </article>
  )
}
