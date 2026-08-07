'use client'

import { useId } from 'react'
import { BadgeTooltip } from '@/components/badge-tooltip'

export const TOP_PREDICTOR_BADGE_LABEL = 'Kuukauden ennustaja'

type TopPredictorBadgeProps = {
  size?: 'sm' | 'md' | 'lg'
  /** Show "KE" mark — only on lg */
  showMark?: boolean
  className?: string
}

const SIZE_PX = {
  sm: 16,
  md: 22,
  lg: 36,
} as const

/** Platinum medal for #1 monthly predictor: rocket + % glow. */
export function TopPredictorBadge({
  size = 'sm',
  showMark = false,
  className = '',
}: TopPredictorBadgeProps) {
  const uid = useId().replace(/:/g, '')
  const px = SIZE_PX[size]
  const mark = showMark && size === 'lg'
  const bg = `tp-bg-${uid}`
  const platinum = `tp-plat-${uid}`
  const green = `tp-green-${uid}`
  const glow = `tp-glow-${uid}`

  return (
    <BadgeTooltip
      label={TOP_PREDICTOR_BADGE_LABEL}
      className={className}
      style={{ width: px, height: px }}
      side="below"
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block size-full drop-shadow-[0_0_5px_rgba(160,200,255,0.4)]"
        aria-hidden
      >
        <defs>
          <radialGradient id={bg} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#1a2744" />
            <stop offset="65%" stopColor="#0c1220" />
            <stop offset="100%" stopColor="#05070c" />
          </radialGradient>
          <linearGradient
            id={platinum}
            x1="10"
            y1="6"
            x2="54"
            y2="58"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f5f8ff" />
            <stop offset="40%" stopColor="#c5d4e8" />
            <stop offset="100%" stopColor="#7a8fa8" />
          </linearGradient>
          <linearGradient
            id={green}
            x1="24"
            y1="48"
            x2="40"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#86efac" />
          </linearGradient>
          <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle cx="32" cy="32" r="30" fill={`url(#${bg})`} />
        <circle
          cx="32"
          cy="32"
          r="30"
          stroke={`url(#${platinum})`}
          strokeWidth="3.5"
        />
        <circle
          cx="32"
          cy="32"
          r="25.5"
          stroke="#c5d4e8"
          strokeOpacity="0.35"
          strokeWidth="1"
        />

        {/* Soft % in background */}
        <text
          x="32"
          y={mark ? 42 : 44}
          textAnchor="middle"
          fill="#c5d4e8"
          fillOpacity="0.22"
          fontSize="22"
          fontWeight="800"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          %
        </text>

        {/* Rocket / up arrow */}
        <g filter={`url(#${glow})`}>
          <path
            d="M32 14 L38 28 L34 28 L34 42 L30 42 L30 28 L26 28 Z"
            fill={`url(#${green})`}
          />
          <path
            d="M30 42 L26 48 L30 46 L32 50 L34 46 L38 48 L34 42 Z"
            fill="#4ade80"
            fillOpacity="0.9"
          />
          {/* Crown sparkle */}
          <path
            d="M44 18 L45.2 20.4 L47.8 20.6 L45.8 22.3 L46.3 24.8 L44 23.5 L41.7 24.8 L42.2 22.3 L40.2 20.6 L42.8 20.4 Z"
            fill="#e8f0ff"
          />
        </g>

        {mark ? (
          <text
            x="32"
            y="56"
            textAnchor="middle"
            fill="#c5d4e8"
            fontSize="7"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing="0.8"
          >
            KE
          </text>
        ) : null}
      </svg>
    </BadgeTooltip>
  )
}
