import {
  AMM_SEED,
  getOptionPrices,
  getPrices,
  isBinaryMarket,
  normalizeOptionPools,
  type MarketOptionDef,
} from '@/lib/amm'

export type PricePoint = {
  timestamp: Date
  /** Primary series (YES or leading) for delta indicator */
  yesPrice: number
  /** All option prices at this timestamp (keys uppercased) */
  prices: Record<string, number>
}

export type MarketBet = {
  option: string
  amount: number
  created_at: string
}

export type ChartSeries = {
  key: string
  label: string
  colorClass: string
}

const SERIES_COLORS = [
  'stroke-[var(--yes)] fill-[var(--yes)] text-[var(--yes)]',
  'stroke-[var(--no)] fill-[var(--no)] text-[var(--no)]',
  'stroke-primary fill-primary text-primary',
  'stroke-foreground fill-foreground text-foreground',
  'stroke-muted-foreground fill-muted-foreground text-muted-foreground',
]

export function chartSeriesForOptions(options: MarketOptionDef[]): ChartSeries[] {
  return options.map((opt, i) => ({
    key: opt.key.toUpperCase(),
    label: opt.label,
    colorClass: SERIES_COLORS[i % SERIES_COLORS.length],
  }))
}

/** Binary CPMM history (YES price + full prices map). */
export function buildBinaryPriceHistory(
  marketCreatedAt: string | null | undefined,
  bets: MarketBet[],
  currentYesPool: number,
  currentNoPool: number
): PricePoint[] {
  const start = marketCreatedAt ? new Date(marketCreatedAt) : new Date()
  const sorted = [...bets].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  let yesPool = AMM_SEED
  let noPool = AMM_SEED
  const initial = getPrices(yesPool, noPool)

  const points: PricePoint[] = [
    {
      timestamp: start,
      yesPrice: initial.yesPrice,
      prices: { YES: initial.yesPrice, NO: initial.noPrice },
    },
  ]

  for (const bet of sorted) {
    const amount = Number(bet.amount)
    if (!(amount > 0)) continue

    const choice = String(bet.option || '').toUpperCase()
    const k = yesPool * noPool

    if (choice === 'YES') {
      const newNoPool = noPool + amount
      yesPool = k / newNoPool
      noPool = newNoPool
    } else {
      const newYesPool = yesPool + amount
      noPool = k / newYesPool
      yesPool = newYesPool
    }

    const { yesPrice, noPrice } = getPrices(yesPool, noPool)
    points.push({
      timestamp: new Date(bet.created_at),
      yesPrice,
      prices: { YES: yesPrice, NO: noPrice },
    })
  }

  const current = getPrices(currentYesPool, currentNoPool)
  points.push({
    timestamp: new Date(),
    yesPrice: current.yesPrice,
    prices: { YES: current.yesPrice, NO: current.noPrice },
  })

  return points
}

/** Multi-option volume-pool history. */
export function buildMultiPriceHistory(
  marketCreatedAt: string | null | undefined,
  options: MarketOptionDef[],
  bets: MarketBet[],
  currentPools: Record<string, number> | null | undefined
): PricePoint[] {
  const start = marketCreatedAt ? new Date(marketCreatedAt) : new Date()
  const sorted = [...bets].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  let pools = normalizeOptionPools(options, null)
  const initialPrices = getOptionPrices(options, pools)
  const leadingKey =
    [...options].sort(
      (a, b) =>
        (initialPrices[b.key.toUpperCase()] ?? 0) -
        (initialPrices[a.key.toUpperCase()] ?? 0)
    )[0]?.key.toUpperCase() ?? options[0]?.key.toUpperCase()

  const points: PricePoint[] = [
    {
      timestamp: start,
      yesPrice: initialPrices[leadingKey] ?? 1 / Math.max(options.length, 1),
      prices: { ...initialPrices },
    },
  ]

  for (const bet of sorted) {
    const amount = Number(bet.amount)
    if (!(amount > 0)) continue
    const key = String(bet.option || '').toUpperCase()
    if (!(key in pools)) {
      pools = { ...pools, [key]: AMM_SEED }
    }
    pools = { ...pools, [key]: pools[key] + amount }
    const prices = getOptionPrices(options, pools)
    points.push({
      timestamp: new Date(bet.created_at),
      yesPrice: prices[leadingKey] ?? prices[key] ?? 0,
      prices,
    })
  }

  const finalPrices = getOptionPrices(options, currentPools)
  points.push({
    timestamp: new Date(),
    yesPrice: finalPrices[leadingKey] ?? Object.values(finalPrices)[0] ?? 0.5,
    prices: { ...finalPrices },
  })

  return points
}

export function buildPriceHistoryForMarket(args: {
  marketCreatedAt: string | null | undefined
  options: MarketOptionDef[]
  bets: MarketBet[]
  yesPool: number
  noPool: number
  optionPools?: Record<string, number> | null
}): PricePoint[] {
  const { options, bets, marketCreatedAt, yesPool, noPool, optionPools } = args
  if (isBinaryMarket(options)) {
    return buildBinaryPriceHistory(marketCreatedAt, bets, yesPool, noPool)
  }
  return buildMultiPriceHistory(marketCreatedAt, options, bets, optionPools)
}

/** @deprecated Prefer buildPriceHistoryForMarket */
export function buildPriceHistory(
  marketCreatedAt: string | null | undefined,
  bets: MarketBet[],
  currentYesPool: number,
  currentNoPool: number
): PricePoint[] {
  return buildBinaryPriceHistory(
    marketCreatedAt,
    bets,
    currentYesPool,
    currentNoPool
  )
}

export function getPriceChange(points: PricePoint[]): {
  deltaPct: number
  direction: 'up' | 'down' | 'flat'
} {
  if (points.length < 2) {
    return { deltaPct: 0, direction: 'flat' }
  }

  const current = points[points.length - 1].yesPrice
  const baseline = points[0].yesPrice
  const deltaPct = Math.round((current - baseline) * 100)

  return {
    deltaPct,
    direction: deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat',
  }
}
