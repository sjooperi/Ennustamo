'use client'

import { useMemo, useState } from 'react'
import type { ChartSeries, PricePoint } from '@/lib/price-history'

type MarketPriceChartProps = {
  points: PricePoint[]
  series: ChartSeries[]
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

function buildLinePath(coords: { x: number; y: number }[]): string {
  return coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ')
}

function strokeClass(colorClass: string): string {
  const match = colorClass.match(/stroke-\[[^\]]+\]|stroke-[\w-]+/)
  return match?.[0] ?? 'stroke-primary'
}

function fillClass(colorClass: string): string {
  const match = colorClass.match(/fill-\[[^\]]+\]|fill-[\w-]+/)
  return match?.[0] ?? 'fill-primary'
}

function textClass(colorClass: string): string {
  const match = colorClass.match(/text-\[[^\]]+\]|text-[\w-]+/)
  return match?.[0] ?? 'text-primary'
}

export function MarketPriceChart({
  points,
  series,
  className,
}: MarketPriceChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const chart = useMemo(() => {
    const innerWidth = CHART_WIDTH - PADDING.left - PADDING.right
    const innerHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom

    const priceToY = (price: number) =>
      PADDING.top + innerHeight - Math.min(1, Math.max(0, price)) * innerHeight

    const safeSeries =
      series.length > 0
        ? series
        : [
            {
              key: 'YES',
              label: 'Kyllä',
              colorClass: 'stroke-[var(--yes)] fill-[var(--yes)] text-[var(--yes)]',
            },
            {
              key: 'NO',
              label: 'Ei',
              colorClass: 'stroke-[var(--no)] fill-[var(--no)] text-[var(--no)]',
            },
          ]

    if (points.length < 1) {
      return {
        seriesPaths: safeSeries.map((s) => ({
          ...s,
          coords: [] as { x: number; y: number; price: number }[],
          path: '',
        })),
        minTime: Date.now(),
        maxTime: Date.now(),
      }
    }

    const minTime = points[0].timestamp.getTime()
    const maxTime = points[points.length - 1].timestamp.getTime()
    const timeSpan = Math.max(maxTime - minTime, 1)

    const seriesPaths = safeSeries.map((s) => {
      const coords = points.map((point) => {
        const price =
          point.prices?.[s.key] ??
          (s.key === 'YES'
            ? point.yesPrice
            : s.key === 'NO'
              ? 1 - point.yesPrice
              : 0)
        const x =
          points.length === 1
            ? PADDING.left + innerWidth / 2
            : PADDING.left +
              ((point.timestamp.getTime() - minTime) / timeSpan) * innerWidth
        return { x, y: priceToY(price), price }
      })
      return {
        ...s,
        coords,
        path: coords.length >= 2 ? buildLinePath(coords) : '',
      }
    })

    return { seriesPaths, minTime, maxTime }
  }, [points, series])

  const activeIndex = hoverIndex ?? Math.max(0, points.length - 1)

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH
    const refCoords = chart.seriesPaths[0]?.coords ?? []
    let closest = 0
    let closestDist = Infinity
    refCoords.forEach((coord, index) => {
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

  const sidebarSeries = chart.seriesPaths.slice(0, 4)

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

            {chart.seriesPaths.map((s) =>
              s.path ? (
                <path
                  key={s.key}
                  d={s.path}
                  fill="none"
                  className={strokeClass(s.colorClass)}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null
            )}

            {hoverIndex !== null && chart.seriesPaths[0]?.coords[activeIndex] && (
              <line
                x1={chart.seriesPaths[0].coords[activeIndex].x}
                x2={chart.seriesPaths[0].coords[activeIndex].x}
                y1={PADDING.top}
                y2={CHART_HEIGHT - PADDING.bottom}
                className="stroke-muted-foreground/30"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {chart.seriesPaths.map((s) => {
              const coord =
                s.coords[activeIndex] ?? s.coords[s.coords.length - 1]
              if (!coord) return null
              return (
                <circle
                  key={`dot-${s.key}`}
                  cx={coord.x}
                  cy={coord.y}
                  r="3.5"
                  className={`${fillClass(s.colorClass)} stroke-card`}
                  strokeWidth="2"
                />
              )
            })}

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

        <div className="flex w-16 shrink-0 flex-col justify-center gap-2 py-1 sm:w-[4.5rem]">
          {sidebarSeries.map((s) => {
            const coord =
              s.coords[activeIndex] ?? s.coords[s.coords.length - 1]
            return (
              <div key={s.key} className="text-right">
                <p
                  className={`truncate text-[9px] font-semibold sm:text-[10px] ${textClass(s.colorClass)}`}
                >
                  {s.label}
                </p>
                <p
                  className={`font-bold tabular-nums leading-tight sm:text-sm ${textClass(s.colorClass)}`}
                >
                  {formatChartPct(coord?.price ?? 0)}
                </p>
              </div>
            )
          })}
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
