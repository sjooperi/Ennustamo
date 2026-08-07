/** ROI = ((returned - staked) / staked) × 100 */

export function calcRoi(staked: number, returned: number): number | null {
  const s = Number(staked)
  const r = Number(returned)
  if (!(s > 0) || !Number.isFinite(s) || !Number.isFinite(r)) return null
  return Math.round(((r - s) / s) * 10000) / 100
}

/** Minimivetomäärä tulostaulukkoon. */
export const LEADERBOARD_MIN_BETS = 50

/**
 * Volyymipaino: score = ROI × bets^α
 * α = 1.04 kalibroitu niin, että 50 vetoa @ 30 % ROI voittaa
 * nipin napin pelaajan jolla 200 vetoa @ 7 % ROI (~+1.4 %).
 */
export const LEADERBOARD_VOLUME_EXPONENT = 1.04

/**
 * Tulostaulukon pisteytys.
 * Palauttaa null jos alle minimivetorajan.
 */
export function calcLeaderboardScore(
  roiPct: number,
  betCount: number
): number | null {
  const roi = Number(roiPct)
  const bets = Math.floor(Number(betCount))
  if (!Number.isFinite(roi) || !Number.isFinite(bets)) return null
  if (bets < LEADERBOARD_MIN_BETS) return null
  return Math.round(roi * bets ** LEADERBOARD_VOLUME_EXPONENT * 10000) / 10000
}

export function formatRoi(roi: number | null | undefined): string {
  if (roi == null || !Number.isFinite(roi)) return '—'
  const sign = roi > 0 ? '+' : ''
  return `${sign}${roi.toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`
}
