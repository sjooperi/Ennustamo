/**
 * Fixed Product AMM (constant product) for binary YES/NO markets.
 *
 * Prices:
 *   yesPrice = poolNo / (poolYes + poolNo)
 *   noPrice  = poolYes / (poolYes + poolNo)
 *
 * Buying YES with stake `amount`:
 *   k = poolYes * poolNo
 *   newNo  = poolNo + amount
 *   newYes = k / newNo
 *   shares = poolYes - newYes + amount
 *
 * (Buying YES adds collateral to the NO side of the product, which raises the YES price.)
 */

export const AMM_SEED = 100

export type Pools = {
  yesPool: number
  noPool: number
}

export type BuyQuote = {
  shares: number
  avgPrice: number
  newYesPool: number
  newNoPool: number
  priceBefore: number
  priceAfter: number
  slippagePct: number
}

export function normalizePools(yesPool: number, noPool: number): Pools {
  const y = Number(yesPool) || 0
  const n = Number(noPool) || 0

  if (y <= 0 && n <= 0) {
    return { yesPool: AMM_SEED, noPool: AMM_SEED }
  }

  return {
    yesPool: y > 0 ? y : AMM_SEED,
    noPool: n > 0 ? n : AMM_SEED,
  }
}

/** Spot prices in [0, 1]. Empty pools → 0.5 / 0.5. */
export function getPrices(yesPool: number, noPool: number): {
  yesPrice: number
  noPrice: number
} {
  const y = Number(yesPool) || 0
  const n = Number(noPool) || 0

  if (y <= 0 && n <= 0) {
    return { yesPrice: 0.5, noPrice: 0.5 }
  }

  const { yesPool: yes, noPool: no } = normalizePools(y, n)
  const total = yes + no
  return {
    yesPrice: no / total,
    noPrice: yes / total,
  }
}

export function quoteBuy(
  yesPool: number,
  noPool: number,
  choice: 'YES' | 'NO',
  amount: number
): BuyQuote | null {
  if (!(amount > 0)) return null

  const { yesPool: yes, noPool: no } = normalizePools(yesPool, noPool)
  const k = yes * no
  const { yesPrice, noPrice } = getPrices(yesPool, noPool)

  if (choice === 'YES') {
    const priceBefore = yesPrice
    const newNoPool = no + amount
    const newYesPool = k / newNoPool
    const shares = yes - newYesPool + amount
    if (!(shares > 0)) return null
    const avgPrice = amount / shares
    const priceAfter = newNoPool / (newYesPool + newNoPool)
    const slippagePct =
      priceBefore > 0 ? ((avgPrice - priceBefore) / priceBefore) * 100 : 0

    return {
      shares,
      avgPrice,
      newYesPool,
      newNoPool,
      priceBefore,
      priceAfter,
      slippagePct,
    }
  }

  const priceBefore = noPrice
  const newYesPool = yes + amount
  const newNoPool = k / newYesPool
  const shares = no - newNoPool + amount
  if (!(shares > 0)) return null
  const avgPrice = amount / shares
  const priceAfter = newYesPool / (newYesPool + newNoPool)
  const slippagePct =
    priceBefore > 0 ? ((avgPrice - priceBefore) / priceBefore) * 100 : 0

  return {
    shares,
    avgPrice,
    newYesPool,
    newNoPool,
    priceBefore,
    priceAfter,
    slippagePct,
  }
}

export function formatPct(price: number): string {
  return `${Math.round(price * 100)}%`
}

export function formatShares(shares: number): string {
  return shares.toLocaleString('fi-FI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
