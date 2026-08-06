/** ROI = ((returned - staked) / staked) × 100 */

export function calcRoi(staked: number, returned: number): number | null {
  const s = Number(staked)
  const r = Number(returned)
  if (!(s > 0) || !Number.isFinite(s) || !Number.isFinite(r)) return null
  return Math.round(((r - s) / s) * 10000) / 100
}

export function formatRoi(roi: number | null | undefined): string {
  if (roi == null || !Number.isFinite(roi)) return '—'
  const sign = roi > 0 ? '+' : ''
  return `${sign}${roi.toLocaleString('fi-FI', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`
}
