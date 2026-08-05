import { AMM_SEED, getPrices } from '@/lib/amm'

export type PricePoint = {
  timestamp: Date
  yesPrice: number
}

export type MarketBet = {
  option: string
  amount: number
  created_at: string
}

export function buildPriceHistory(
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

  const points: PricePoint[] = [
    {
      timestamp: start,
      yesPrice: 0.5,
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

    points.push({
      timestamp: new Date(bet.created_at),
      yesPrice: getPrices(yesPool, noPool).yesPrice,
    })
  }

  points.push({
    timestamp: new Date(),
    yesPrice: getPrices(currentYesPool, currentNoPool).yesPrice,
  })

  return points
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
