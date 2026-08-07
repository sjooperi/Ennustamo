'use client'

import {
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type BadgeTooltipProps = {
  label: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** Always show tip below the badge (avoids header/tab clipping). */
  side?: 'below' | 'above'
}

/** Hover/focus tooltip rendered in a portal so modals/headers don't clip it. */
export function BadgeTooltip({
  label,
  children,
  className = '',
  style,
  side = 'below',
}: BadgeTooltipProps) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null)

  const showTip = () => {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setTipPos({
      x: rect.left + rect.width / 2,
      y: side === 'below' ? rect.bottom + 8 : rect.top - 8,
    })
  }

  const hideTip = () => setTipPos(null)

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex shrink-0 ${className}`}
      style={style}
      role="img"
      aria-label={label}
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
      tabIndex={0}
    >
      {children}
      {tipPos && typeof document !== 'undefined'
        ? createPortal(
            <span
              role="tooltip"
              className={`pointer-events-none fixed z-[200] -translate-x-1/2 whitespace-nowrap rounded-md border border-[oklch(0.75_0.12_85)]/40 bg-[oklch(0.18_0.02_70)] px-2.5 py-1 text-[11px] font-semibold tracking-wide text-[oklch(0.9_0.08_90)] shadow-lg ${
                side === 'above' ? '-translate-y-full' : ''
              }`}
              style={{ left: tipPos.x, top: tipPos.y }}
            >
              {label}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
