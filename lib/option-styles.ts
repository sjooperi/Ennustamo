import type { MarketOptionDef } from '@/lib/amm'

export type OptionVisualStyle = {
  text: string
  bg: string
  soft: string
  ring: string
  softRing: string
  fg: string
  chart: string
}

const YES_STYLE: OptionVisualStyle = {
  text: 'text-[var(--yes)]',
  bg: 'bg-[var(--yes)]',
  soft: 'bg-[var(--yes)]/18',
  ring: 'ring-[var(--yes)]',
  softRing: 'ring-[var(--yes)]/35',
  fg: 'text-[var(--yes-foreground)]',
  chart: 'stroke-[var(--yes)] fill-[var(--yes)] text-[var(--yes)]',
}

const NO_STYLE: OptionVisualStyle = {
  text: 'text-[var(--no)]',
  bg: 'bg-[var(--no)]',
  soft: 'bg-[var(--no)]/20',
  ring: 'ring-[var(--no)]',
  softRing: 'ring-[var(--no)]/45',
  fg: 'text-[var(--no-foreground)]',
  chart: 'stroke-[var(--no)] fill-[var(--no)] text-[var(--no)]',
}

/** Stylish dark pair for 2-way markets that are not Kyllä/Ei (e.g. teams). */
const DUAL_DARK_STYLES: OptionVisualStyle[] = [
  {
    text: 'text-[oklch(0.82_0.04_250)]',
    bg: 'bg-[var(--opt-dark-a)]',
    soft: 'bg-[var(--opt-dark-a)]/50',
    ring: 'ring-[var(--opt-dark-a)]',
    softRing: 'ring-[oklch(0.82_0.04_250)]/40',
    fg: 'text-[var(--opt-dark-a-fg)]',
    chart: 'stroke-[var(--opt-dark-a)] fill-[var(--opt-dark-a)] text-[oklch(0.82_0.04_250)]',
  },
  {
    text: 'text-[oklch(0.82_0.04_200)]',
    bg: 'bg-[var(--opt-dark-b)]',
    soft: 'bg-[var(--opt-dark-b)]/50',
    ring: 'ring-[var(--opt-dark-b)]',
    softRing: 'ring-[oklch(0.82_0.04_200)]/40',
    fg: 'text-[var(--opt-dark-b-fg)]',
    chart: 'stroke-[var(--opt-dark-b)] fill-[var(--opt-dark-b)] text-[oklch(0.82_0.04_200)]',
  },
]

const MULTI_STYLES: OptionVisualStyle[] = [
  {
    text: 'text-[var(--opt-1)]',
    bg: 'bg-[var(--opt-1)]',
    soft: 'bg-[var(--opt-1)]/18',
    ring: 'ring-[var(--opt-1)]',
    softRing: 'ring-[var(--opt-1)]/35',
    fg: 'text-[var(--opt-1-fg)]',
    chart: 'stroke-[var(--opt-1)] fill-[var(--opt-1)] text-[var(--opt-1)]',
  },
  {
    text: 'text-[var(--opt-2)]',
    bg: 'bg-[var(--opt-2)]',
    soft: 'bg-[var(--opt-2)]/18',
    ring: 'ring-[var(--opt-2)]',
    softRing: 'ring-[var(--opt-2)]/35',
    fg: 'text-[var(--opt-2-fg)]',
    chart: 'stroke-[var(--opt-2)] fill-[var(--opt-2)] text-[var(--opt-2)]',
  },
  {
    text: 'text-[var(--opt-3)]',
    bg: 'bg-[var(--opt-3)]',
    soft: 'bg-[var(--opt-3)]/18',
    ring: 'ring-[var(--opt-3)]',
    softRing: 'ring-[var(--opt-3)]/35',
    fg: 'text-[var(--opt-3-fg)]',
    chart: 'stroke-[var(--opt-3)] fill-[var(--opt-3)] text-[var(--opt-3)]',
  },
  {
    text: 'text-[var(--opt-4)]',
    bg: 'bg-[var(--opt-4)]',
    soft: 'bg-[var(--opt-4)]/18',
    ring: 'ring-[var(--opt-4)]',
    softRing: 'ring-[var(--opt-4)]/35',
    fg: 'text-[var(--opt-4-fg)]',
    chart: 'stroke-[var(--opt-4)] fill-[var(--opt-4)] text-[var(--opt-4)]',
  },
  {
    text: 'text-[var(--opt-5)]',
    bg: 'bg-[var(--opt-5)]',
    soft: 'bg-[var(--opt-5)]/18',
    ring: 'ring-[var(--opt-5)]',
    softRing: 'ring-[var(--opt-5)]/35',
    fg: 'text-[var(--opt-5-fg)]',
    chart: 'stroke-[var(--opt-5)] fill-[var(--opt-5)] text-[var(--opt-5)]',
  },
  {
    text: 'text-[var(--opt-6)]',
    bg: 'bg-[var(--opt-6)]',
    soft: 'bg-[var(--opt-6)]/18',
    ring: 'ring-[var(--opt-6)]',
    softRing: 'ring-[var(--opt-6)]/35',
    fg: 'text-[var(--opt-6-fg)]',
    chart: 'stroke-[var(--opt-6)] fill-[var(--opt-6)] text-[var(--opt-6)]',
  },
]

function normalizeLabel(label: string): string {
  return String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isYesLabel(label: string): boolean {
  const n = normalizeLabel(label)
  return n === 'kylla' || n === 'yes' || n === 'y'
}

function isNoLabel(label: string): boolean {
  const n = normalizeLabel(label)
  return n === 'ei' || n === 'no' || n === 'n'
}

/**
 * True only when the two options are literally Kyllä/Ei (or Yes/No).
 * Team matchups with YES/NO keys but team labels return false.
 */
export function isYesNoChoiceMarket(
  options: MarketOptionDef[] | null | undefined
): boolean {
  if (!options || options.length !== 2) return false
  const a = options[0]
  const b = options[1]
  return (
    (isYesLabel(a.label) && isNoLabel(b.label)) ||
    (isNoLabel(a.label) && isYesLabel(b.label))
  )
}

export function optionVisualStyle(
  options: MarketOptionDef[],
  index: number,
  option?: MarketOptionDef
): OptionVisualStyle {
  if (isYesNoChoiceMarket(options)) {
    const opt = option ?? options[index]
    if (opt && isYesLabel(opt.label)) return YES_STYLE
    if (opt && isNoLabel(opt.label)) return NO_STYLE
    const key = String(opt?.key || '').toUpperCase()
    return key === 'YES' ? YES_STYLE : NO_STYLE
  }

  if (options.length === 2) {
    return DUAL_DARK_STYLES[index % 2]
  }

  return MULTI_STYLES[index % MULTI_STYLES.length]
}
