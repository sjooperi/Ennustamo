/**
 * Public display name helpers.
 * - Custom nickname lives in `username`
 * - Google / OAuth full name lives in `display_name`
 * Fallback format: "Etunimi S" (first name + last initial)
 */

export function formatShortRealName(fullName: string | null | undefined): string {
  const trimmed = (fullName || '').trim()
  if (!trimmed) return 'pelaaja'

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]

  const first = parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? ''
  return lastInitial ? `${first} ${lastInitial}` : first
}

export function resolvePublicName(options: {
  username?: string | null
  displayName?: string | null
  email?: string | null
}): string {
  const nick = options.username?.trim()
  const real = options.displayName?.trim()

  // Prefer custom nickname. Ignore legacy rows where username was copied from Google name.
  const isCustom =
    !!nick && (!real || nick.toLowerCase() !== real.toLowerCase())

  if (isCustom) return nick

  if (real) {
    return formatShortRealName(real)
  }

  if (options.email?.includes('@')) {
    return options.email.split('@')[0]
  }

  return 'pelaaja'
}

export function initialsFromPublicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function validateUsername(raw: string): string | null {
  const value = normalizeUsername(raw)
  if (value.length < 3) return 'Nimimerkin tulee olla vähintään 3 merkkiä.'
  if (value.length > 24) return 'Nimimerkki saa olla enintään 24 merkkiä.'
  if (!/^[\p{L}\p{N}_.\- ]+$/u.test(value)) {
    return 'Nimimerkissä saa olla kirjaimia, numeroita, välilyöntejä, _ . -'
  }
  return null
}
