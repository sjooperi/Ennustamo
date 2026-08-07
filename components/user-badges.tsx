'use client'

import { MarketWizardBadge } from '@/components/market-wizard-badge'
import { OracleBadge } from '@/components/oracle-badge'
import { TopPredictorBadge } from '@/components/top-predictor-badge'

export type UserBadgeFlags = {
  hasMarketWizardBadge?: boolean
  isTopPredictor?: boolean
  isOracle?: boolean
}

type UserBadgesProps = UserBadgeFlags & {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/** Renders every public badge a user currently holds. */
export function UserBadges({
  hasMarketWizardBadge,
  isTopPredictor,
  isOracle,
  size = 'md',
  className = '',
}: UserBadgesProps) {
  if (!hasMarketWizardBadge && !isTopPredictor && !isOracle) return null

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {isOracle ? <OracleBadge size={size} /> : null}
      {isTopPredictor ? <TopPredictorBadge size={size} /> : null}
      {hasMarketWizardBadge ? <MarketWizardBadge size={size} /> : null}
    </span>
  )
}
