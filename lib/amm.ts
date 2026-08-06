/**
 * Fixed Product AMM (constant product) for binary YES/NO markets.
 *
 * Multi-option markets use option_pools volume pricing:
 *   price_i = pool_i / sum(pools)
 *   shares = stake / price_i  (1 share pays 1 Fyrkka on win)
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

export type MarketOptionDef = {
  key: string
  label: string
}

export type FixedOddsQuote = {
  pricePerShare: number
  shares: number
  payout: number
  profit: number
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

/** Normalize option_pools map; missing keys get AMM_SEED. */
export function normalizeOptionPools(
  options: MarketOptionDef[],
  pools: Record<string, number> | null | undefined
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const opt of options) {
    const key = opt.key.toUpperCase()
    const raw = pools?.[key] ?? pools?.[opt.key]
    const n = Number(raw)
    next[key] = n > 0 ? n : AMM_SEED
  }
  return next
}

/** price_i = pool_i / sum(pools) for multi-option markets. */
export function getOptionPrices(
  options: MarketOptionDef[],
  pools: Record<string, number> | null | undefined
): Record<string, number> {
  const normalized = normalizeOptionPools(options, pools)
  const total = Object.values(normalized).reduce((s, v) => s + v, 0)
  const prices: Record<string, number> = {}
  for (const opt of options) {
    const key = opt.key.toUpperCase()
    prices[key] = total > 0 ? normalized[key] / total : 1 / Math.max(options.length, 1)
  }
  return prices
}

export function quoteFixedOdds(
  price01: number,
  stake: number
): FixedOddsQuote | null {
  if (!(stake > 0)) return null
  const pricePerShare = price01 * 100
  if (!(pricePerShare > 0)) return null

  const shares = stake / pricePerShare
  const payout = shares * 100
  const profit = payout - stake

  return { pricePerShare, shares, payout, profit }
}

export function quoteMultiBuy(
  options: MarketOptionDef[],
  pools: Record<string, number> | null | undefined,
  choice: string,
  amount: number
): FixedOddsQuote | null {
  if (!(amount > 0)) return null
  const key = choice.toUpperCase()
  const prices = getOptionPrices(options, pools)
  const price01 = prices[key]
  if (!(price01 > 0)) return null
  return quoteFixedOdds(price01, amount)
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

/** Convert AMM shares (1 share ≈ 1 F payout) to display shares (1 share ≈ 100 F payout). */
export function toDisplayShares(ammShares: number): number {
  return ammShares / 100
}

export function isBinaryMarket(options: MarketOptionDef[] | null | undefined): boolean {
  if (!options || options.length !== 2) return false
  const keys = options.map((o) => o.key.toUpperCase())
  return keys.includes('YES') && keys.includes('NO')
}

export function parseOptionPools(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (k && Number.isFinite(n)) out[k.toUpperCase()] = n
  }
  return out
}

export function parseMarketOptions(raw: unknown): MarketOptionDef[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { key: 'YES', label: 'Kyllä' },
      { key: 'NO', label: 'Ei' },
    ]
  }

  const parsed: MarketOptionDef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = String((item as { key?: unknown }).key || '').trim()
    const label = String((item as { label?: unknown }).label || '').trim()
    if (!key || !label) continue
    parsed.push({ key: key.toUpperCase(), label })
  }

  return parsed.length >= 2
    ? parsed
    : [
        { key: 'YES', label: 'Kyllä' },
        { key: 'NO', label: 'Ei' },
      ]
}
