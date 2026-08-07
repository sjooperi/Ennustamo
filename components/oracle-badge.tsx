'use client'

import { useId } from 'react'
import { BadgeTooltip } from '@/components/badge-tooltip'

export const ORACLE_BADGE_LABEL = 'Kaikkien aikojen ennustaja'

type OracleBadgeProps = {
  size?: 'sm' | 'md' | 'lg'
  showMark?: boolean
  className?: string
}

const SIZE_PX = {
  sm: 16,
  md: 22,
  lg: 36,
} as const

/** Crystal-sphere medal: all-seeing eye for all-time #1 predictor. */
export function OracleBadge({
  size = 'sm',
  showMark = false,
  className = '',
}: OracleBadgeProps) {
  const uid = useId().replace(/:/g, '')
  const px = SIZE_PX[size]
  const mark = showMark && size === 'lg'
  const bg = `or-bg-${uid}`
  const rim = `or-rim-${uid}`
  const glow = `or-glow-${uid}`

  return (
    <BadgeTooltip
      label={ORACLE_BADGE_LABEL}
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
        className="block size-full drop-shadow-[0_0_5px_rgba(180,210,255,0.45)]"
        aria-hidden
      >
        <defs>
          <radialGradient id={bg} cx="50%" cy="42%" r="62%">
            <stop offset="0%" stopColor="#1a2a4a" />
            <stop offset="55%" stopColor="#0a1020" />
            <stop offset="100%" stopColor="#030508" />
          </radialGradient>
          <linearGradient
            id={rim}
            x1="10"
            y1="8"
            x2="54"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f0f6ff" />
            <stop offset="45%" stopColor="#b8d0f0" />
            <stop offset="100%" stopColor="#6a88b0" />
          </linearGradient>
          <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Full moon / crystal sphere */}
        <circle cx="32" cy="32" r="30" fill={`url(#${bg})`} />
        <circle
          cx="32"
          cy="32"
          r="30"
          stroke={`url(#${rim})`}
          strokeWidth="3"
        />
        <circle
          cx="32"
          cy="32"
          r="25"
          stroke="#dce8ff"
          strokeOpacity="0.25"
          strokeWidth="1"
        />

        {/* All-seeing eye */}
        <g filter={`url(#${glow})`}>
          <ellipse
            cx="32"
            cy="32"
            rx="16"
            ry="9"
            stroke="#e8f0ff"
            strokeWidth="2.2"
            fill="none"
          />
          <circle cx="32" cy="32" r="5.5" fill="#e8f0ff" />
          <circle cx="32" cy="32" r="2.6" fill="#0a1020" />
          <circle cx="33.2" cy="30.8" r="1" fill="#ffffff" fillOpacity="0.9" />
        </g>

        {mark ? (
          <text
            x="32"
            y="54"
            textAnchor="middle"
            fill="#c8dcff"
            fontSize="6.5"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing="0.6"
          >
            KA
          </text>
        ) : null}
      </svg>
    </BadgeTooltip>
  )
}
