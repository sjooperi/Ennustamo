'use client'

import { useMemo, useState } from 'react'
import type { PricePoint } from '@/lib/price-history'

type MarketPriceChartProps = {
  points: PricePoint[]
  className?: string
}

const CHART_WIDTH = 400
const CHART_HEIGHT = 140
const PADDING = { top: 10, right: 8, bottom: 22, left: 8 }
const GRID_LEVELS = [0, 0.25, 0.5, 0.75, 1]

function formatChartPct(price: number): string {
  return `${(price * 100).toFixed(1)}%`
}

function formatAxisTime(date: Date): string {
  return date.toLocaleString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buildLinePath(
  coords: { x: number; y: number }[]
): string {
  return coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')
}

export function MarketPriceChart({ points, className }: MarketPriceChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const chart = useMemo(() => {
    const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right
    const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom

    const priceToY = (price: number) =>
      PADDING.top + innerHeight - price * innerHeight

    if (points.length < 2) {
      const yesPrice = points[0]?.yesPrice ?? 0.5
      const noPrice = 1 - yesPrice
      const x = PADDING.left + innerWidth / 2
      return {
        yesCoords: [{ x, y: priceToY(yesPrice), price: yesPrice }],
        noCoords: [{ x, y: priceToY(noPrice), price: noPrice }],
        yesLinePath: '',
        noLinePath: '',
        minTime: Date.now(),
        maxTime: Date.now(),
      }
    }

    const minTime = points[0].timestamp.getTime()
    const maxTime = points[points.length - 1].timestamp.getTime()
    const timeSpan = Math.max(maxTime - minTime, 1)

    const yesCoords = points.map((point) => {
      const x =
        PADDING.left +
        ((point.timestamp.getTime() - minTime) / timeSpan) * innerWidth
      return {
        x,
        y: priceToY(point.yesPrice),
        price: point.yesPrice,
      }
    })

    const noCoords = points.map((point) => {
      const noPrice = 1 - point.yesPrice
      const x =
        PADDING.left +
        ((point.timestamp.getTime() - minTime) / timeSpan) * innerWidth
      return {
        x,
        y: priceToY(noPrice),
        price: noPrice,
      }
    })

    return {
      yesCoords,
      noCoords,
      yesLinePath: buildLinePath(yesCoords),
      noLinePath: buildLinePath(noCoords),
      minTime,
      maxTime,
    }
  }, [points])

  const activeIndex = hoverIndex ?? points.length - 1
  const activeYes = chart.yesCoords[activeIndex] ?? chart.yesCoords[chart.yesCoords.length - 1]
  const activeNo = chart.noCoords[activeIndex] ?? chart.noCoords[chart.noCoords.length - 1]
  const lastYes = chart.yesCoords[chart.yesCoords.length - 1]
  const lastNo = chart.noCoords[chart.noCoords.length - 1]

  const displayYes = hoverIndex !== null ? activeYes : lastYes
  const displayNo = hoverIndex !== null ? activeNo : lastNo

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH

    let closest = 0
    let closestDist = Infinity
    chart.yesCoords.forEach((coord, index) => {
      const dist = Math.abs(coord.x - x)
      if (dist < closestDist) {
        closestDist = dist
        closest = index
      }
    })
    setHoverIndex(closest)
  }

  const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom
  const priceToY = (price: number) =>
    PADDING.top + innerHeight - price * innerHeight

  return (
    <div
      className={`w-full max-w-full overflow-hidden rounded-xl border border-border bg-secondary/30 p-3 ${className ?? ''}`}
    >
      <div className="flex w-full max-w-full gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 overflow-hidden">
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-28 w-full max-w-full touch-none sm:h-36"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            aria-hidden
          >
            {GRID_LEVELS.map((level) => {
              const y = priceToY(level)
              return (
                <g key={level}>
                  <line
                    x1={PADDING.left}
                    x2={CHART_WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    className="stroke-border"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={CHART_WIDTH - PADDING.right - 2}
                    y={y + 3}
                    className="fill-muted-foreground"
                    fontSize="9"
                    textAnchor="end"
                  >
                    {Math.round(level * 100)}%
                  </text>
                </g>
              )
            })}

            {chart.noLinePath && (
              <path
                d={chart.noLinePath}
                fill="none"
                className="stroke-[var(--no)]"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {chart.yesLinePath && (
              <path
                d={chart.yesLinePath}
                fill="none"
                className="stroke-[var(--yes)]"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {hoverIndex !== null && displayYes && (
              <line
                x1={displayYes.x}
                x2={displayYes.x}
                y1={PADDING.top}
                y2={CHART_HEIGHT - PADDING.bottom}
                className="stroke-muted-foreground/30"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {displayYes && (
              <circle
                cx={displayYes.x}
                cy={displayYes.y}
                r="3.5"
                className="fill-[var(--yes)] stroke-card"
                strokeWidth="2"
              />
            )}

            {displayNo && (
              <circle
                cx={displayNo.x}
                cy={displayNo.y}
                r="3.5"
                className="fill-[var(--no)] stroke-card"
                strokeWidth="2"
              />
            )}

            <text
              x={PADDING.left}
              y={CHART_HEIGHT - 4}
              className="fill-muted-foreground"
              fontSize="9"
            >
              {formatAxisTime(new Date(chart.minTime))}
            </text>
            <text
              x={CHART_WIDTH - PADDING.right}
              y={CHART_HEIGHT - 4}
              className="fill-muted-foreground"
              fontSize="9"
              textAnchor="end"
            >
              {formatAxisTime(new Date(chart.maxTime))}
            </text>
          </svg>
        </div>

        <div className="flex w-12 shrink-0 flex-col justify-between py-1 sm:w-16">
          <div className="text-right">
            <p className="text-[9px] font-medium text-[var(--yes)] sm:text-[10px]">
              KYLLÄ
            </p>
            <p className="text-sm font-bold tabular-nums leading-tight text-[var(--yes)] sm:text-lg">
              {formatChartPct(displayYes?.price ?? 0.5)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-medium text-[var(--no)] sm:text-[10px]">EI</p>
            <p className="text-sm font-bold tabular-nums leading-tight text-[var(--no)] sm:text-lg">
              {formatChartPct(displayNo?.price ?? 0.5)}
            </p>
          </div>
        </div>
      </div>

      {hoverIndex !== null && points[activeIndex] && (
        <p className="mt-1 text-center text-[10px] text-muted-foreground">
          {formatAxisTime(points[activeIndex].timestamp)}
        </p>
      )}
    </div>
  )
}
