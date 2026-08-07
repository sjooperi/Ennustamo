/** Tuotto-% = ((palautettu - panostettu) / panostettu) × 100 */

export function calcTuottoPct(staked: number, returned: number): number | null {
  const s = Number(staked)
  const r = Number(returned)
  if (!(s > 0) || !Number.isFinite(s) || !Number.isFinite(r)) return null
  return Math.round(((r - s) / s) * 10000) / 100
}

/** @deprecated use calcTuottoPct */
export const calcRoi = calcTuottoPct

/** Minimivetomäärä kuukausilistalle. */
export const LEADERBOARD_MIN_BETS_MONTHLY = 10

/** Max rows shown in the full leaderboard modal. */
export const LEADERBOARD_TOP_N = 10

/** Minimimäärä ratkaistuja vetoja kaikkien aikojen listalle. */
export const LEADERBOARD_MIN_BETS_ALLTIME = 50

/** @deprecated use LEADERBOARD_MIN_BETS_MONTHLY */
export const LEADERBOARD_MIN_BETS = LEADERBOARD_MIN_BETS_MONTHLY

export const LEADERBOARD_VOLUME_EXPONENT = 1.04

export function calcLeaderboardScore(
  tuottoPct: number,
  betCount: number,
  minBets = LEADERBOARD_MIN_BETS_MONTHLY
): number | null {
  const pct = Number(tuottoPct)
  const bets = Math.floor(Number(betCount))
  if (!Number.isFinite(pct) || !Number.isFinite(bets)) return null
  if (bets < minBets) return null
  return Math.round(pct * bets ** LEADERBOARD_VOLUME_EXPONENT * 10000) / 10000
}

export function formatTuotto(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`
}

/** @deprecated use formatTuotto */
export const formatRoi = formatTuotto
