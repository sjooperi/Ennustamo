import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * PKCE sessions are exchanged ONLY on /auth/callback.
 * Keeping detectSessionInUrl off avoids a double-exchange race with AuthProvider
 * ("Unable to exchange external code").
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

export function getAuthCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    return `${siteUrl.replace(/\/$/, '')}/auth/callback`
  }

  return 'http://localhost:3000/auth/callback'
}

const AUTH_RETURN_KEY = 'ennustamo_auth_return_to'

/** Remember where to return after Google / email auth (e.g. /admin). */
export function rememberAuthReturnPath(path?: string): void {
  if (typeof window === 'undefined') return
  const next =
    path ||
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (!next || next.startsWith('/auth/callback')) {
    sessionStorage.removeItem(AUTH_RETURN_KEY)
    return
  }
  sessionStorage.setItem(AUTH_RETURN_KEY, next)
}

export function consumeAuthReturnPath(fallback = '/'): string {
  if (typeof window === 'undefined') return fallback
  const stored = sessionStorage.getItem(AUTH_RETURN_KEY)
  sessionStorage.removeItem(AUTH_RETURN_KEY)
  if (!stored || !stored.startsWith('/') || stored.startsWith('//')) {
    return fallback
  }
  return stored
}
