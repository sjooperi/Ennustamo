'use client'

import { useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MARKET_WIZARD_BADGE_LABEL } from '@/lib/community'

type MarketWizardBadgeProps = {
  /** sm ≈ 16px overlay, md ≈ 22px, lg ≈ 36px profile */
  size?: 'sm' | 'md' | 'lg'
  /** Tiny "MV" mark — only on lg */
  showMark?: boolean
  className?: string
}

const SIZE_PX = {
  sm: 16,
  md: 22,
  lg: 36,
} as const

/** Compact gold medal: wizard hat + neon green uptrend. Readable at 16–64px. */
export function MarketWizardBadge({
  size = 'sm',
  showMark = false,
  className = '',
}: MarketWizardBadgeProps) {
  const uid = useId().replace(/:/g, '')
  const px = SIZE_PX[size]
  const mark = showMark && size === 'lg'
  const rootRef = useRef<HTMLSpanElement>(null)
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null)
  const bg = `mv-bg-${uid}`
  const gold = `mv-gold-${uid}`
  const hat = `mv-hat-${uid}`
  const curve = `mv-curve-${uid}`
  const glow = `mv-glow-${uid}`

  const showTip = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setTipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }

  const hideTip = () => setTipPos(null)

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className}`}
      style={{ width: px, height: px }}
      role="img"
      aria-label={MARKET_WIZARD_BADGE_LABEL}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
      tabIndex={0}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block size-full drop-shadow-[0_0_4px_rgba(212,175,55,0.45)]"
        aria-hidden
      >
        <defs>
          <radialGradient id={bg} cx="50%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#2a2418" />
            <stop offset="70%" stopColor="#14110c" />
            <stop offset="100%" stopColor="#0a0907" />
          </radialGradient>
          <linearGradient
            id={gold}
            x1="12"
            y1="8"
            x2="52"
            y2="56"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f0e6a8" />
            <stop offset="45%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8a6914" />
          </linearGradient>
          <linearGradient
            id={hat}
            x1="22"
            y1="14"
            x2="42"
            y2="36"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#3d3428" />
            <stop offset="100%" stopColor="#1a1612" />
          </linearGradient>
          <linearGradient
            id={curve}
            x1="18"
            y1="48"
            x2="48"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#1faa5a" />
            <stop offset="100%" stopColor="#7dffb0" />
          </linearGradient>
          <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="b" />
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
          stroke={`url(#${gold})`}
          strokeWidth="3.5"
        />
        <circle
          cx="32"
          cy="32"
          r="25.5"
          stroke="#d4af37"
          strokeOpacity="0.35"
          strokeWidth="1"
        />

        <path
          d="M20 34.5 C22 30 26 22 32 14 C38 22 42 30 44 34.5 Z"
          fill={`url(#${hat})`}
          stroke={`url(#${gold})`}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <ellipse
          cx="32"
          cy="35"
          rx="14"
          ry="3.2"
          fill="#1a1612"
          stroke={`url(#${gold})`}
          strokeWidth="1.2"
        />
        <path
          d="M24.5 31.2 Q32 29.6 39.5 31.2"
          stroke="#d4af37"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M32 18.2 L33.1 20.6 L35.8 20.9 L33.8 22.6 L34.3 25.2 L32 23.9 L29.7 25.2 L30.2 22.6 L28.2 20.9 L30.9 20.6 Z"
          fill="#f0e6a8"
        />

        <g filter={`url(#${glow})`}>
          <path
            d={
              mark
                ? 'M18 44 L26 40.5 L33 42.5 L41 33 L47 28.5'
                : 'M18 46 L26 42 L33 44 L42 33 L48 28'
            }
            stroke={`url(#${curve})`}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={
              mark
                ? 'M47 28.5 L47 34.5 L41 34.5 Z'
                : 'M48 28 L48 34.5 L41.5 34.5 Z'
            }
            fill="#7dffb0"
          />
        </g>

        {mark ? (
          <text
            x="32"
            y="55"
            textAnchor="middle"
            fill="#d4af37"
            fontSize="7.5"
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            letterSpacing="1"
          >
            MV
          </text>
        ) : null}
      </svg>

      {tipPos && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[oklch(0.75_0.12_85)]/40 bg-[oklch(0.18_0.02_70)] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[oklch(0.9_0.08_90)] shadow-lg"
              style={{ left: tipPos.x, top: tipPos.y }}
            >
              {MARKET_WIZARD_BADGE_LABEL}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
