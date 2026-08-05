'use client'

import { useEffect, useId, useState } from 'react'
import { Lock, Mail, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ensureProfileForUser } from '@/lib/auth-profile'
import { getAuthCallbackUrl, supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'register'

type AuthModalProps = {
  open: boolean
  onClose: () => void
  initialMode?: AuthMode
  onSuccess?: () => void
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function translateAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('invalid login credentials')) {
    return 'Virheellinen sähköposti tai salasana.'
  }
  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered')
  ) {
    return 'Tällä sähköpostilla on jo tili. Kirjaudu sisään.'
  }
  if (lower.includes('password') && (lower.includes('at least') || lower.includes('weak'))) {
    return 'Salasanan tulee olla vähintään 6 merkkiä.'
  }
  if (lower.includes('email rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Liian monta yritystä. Odota hetki ja yritä uudelleen.'
  }
  if (lower.includes('error sending') && lower.includes('email')) {
    return 'Vahvistusviestin lähetys epäonnistui. Kokeile myöhemmin tai Google-kirjautumista.'
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return 'Rekisteröityminen on pois päältä Supabase-projektissa.'
  }
  if (lower.includes('provider is not enabled') || lower.includes('unsupported provider')) {
    return 'Google-kirjautuminen ei ole vielä päällä Supabasessa. Ota Provider käyttöön Dashboardissa.'
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Tarkista sähköpostiosoite.'
  }
  if (lower.includes('email logins are disabled')) {
    return 'Sähköpostikirjautuminen on pois päältä Supabase-asetuksissa.'
  }

  return message
}

export function AuthModal({
  open,
  onClose,
  initialMode = 'login',
  onSuccess,
}: AuthModalProps) {
  const titleId = useId()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setInfo(null)
    setLoading(false)
    setOauthLoading(false)
  }, [open, initialMode])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const isLogin = mode === 'login'

  const finishSignedIn = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      await ensureProfileForUser(user)
    }
    onSuccess?.()
    onClose()
  }

  const handleGoogleSignIn = async () => {
    setError(null)
    setInfo(null)
    setOauthLoading(true)

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthCallbackUrl(),
        },
      })

      if (oauthError) {
        setError(translateAuthError(oauthError.message))
        setOauthLoading(false)
      }
      // Browser navigates away on success — leave loading state on.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google-kirjautuminen epäonnistui.')
      setOauthLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !password) {
      setError('Täytä sähköposti ja salasana.')
      return
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Salasanat eivät täsmää.')
      return
    }

    if (!isLogin && password.length < 6) {
      setError('Salasanan tulee olla vähintään 6 merkkiä.')
      return
    }

    setLoading(true)

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        })
        if (signInError) {
          setError(translateAuthError(signInError.message))
          return
        }
        await finishSignedIn()
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
        },
      })

      if (signUpError) {
        setError(translateAuthError(signUpError.message))
        return
      }

      // Supabase returns a user with empty identities when email already exists
      // and "Confirm email" is enabled (to avoid leaking account existence).
      if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
        setError('Tällä sähköpostilla on jo tili. Kirjaudu sisään tai käytä Googlea.')
        setMode('login')
        return
      }

      if (data.session) {
        await finishSignedIn()
        return
      }

      if (data.user) {
        // Confirmation required — profile trigger still runs on auth.users insert.
        setInfo(
          'Tilin luonti onnistui. Vahvista sähköpostisi saamallasi linkillä, sitten kirjaudu sisään. Voit myös poistaa vahvistuksen pois päältä: Supabase → Authentication → Providers → Email → Confirm email.'
        )
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        return
      }

      setError('Rekisteröityminen ei onnistunut. Tarkista Supabase Auth -asetukset.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Odottamaton virhe.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || oauthLoading

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Sulje"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/15 to-transparent" />

        <div className="relative flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <TrendingUp className="size-5" strokeWidth={2.5} />
            </span>
            <div>
              <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                {isLogin ? 'Kirjaudu sisään' : 'Luo tili'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isLogin
                  ? 'Jatka Ennustamoon omalla tililläsi.'
                  : 'Aloita ennustaminen ilmaiseksi.'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl"
            onClick={onClose}
            aria-label="Sulje kirjautuminen"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="relative space-y-4 px-5 pt-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-secondary/70 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
                setInfo(null)
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isLogin
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Kirjaudu
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setError(null)
                setInfo(null)
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                !isLogin
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Rekisteröidy
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={handleGoogleSignIn}
            className="h-11 w-full rounded-xl border-border bg-background text-sm font-semibold hover:bg-secondary"
          >
            <GoogleIcon className="size-5" />
            {oauthLoading ? 'Siirrytään Googleen...' : 'Kirjaudu Googlella'}
          </Button>

          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">tai sähköpostilla</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-4 px-5 py-5">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Sähköposti</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nimi@email.fi"
                className="h-11 w-full rounded-xl border border-input bg-secondary/50 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Salasana</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Salasanasi' : 'Vähintään 6 merkkiä'}
                className="h-11 w-full rounded-xl border border-input bg-secondary/50 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
              />
            </div>
          </label>

          {!isLogin && (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                Vahvista salasana
              </span>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Toista salasana"
                  className="h-11 w-full rounded-xl border border-input bg-secondary/50 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
                />
              </div>
            </label>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 py-2 text-sm text-[var(--no)]"
            >
              {error}
            </p>
          )}

          {info && (
            <p
              role="status"
              className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
            >
              {info}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl text-sm font-semibold"
          >
            {loading
              ? isLogin
                ? 'Kirjaudutaan...'
                : 'Luodaan tiliä...'
              : isLogin
                ? 'Kirjaudu sisään'
                : 'Luo tili'}
          </Button>
        </form>

        <div className="relative border-t border-border px-5 py-4 text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>
              Ei tiliä vielä?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setMode('register')
                  setError(null)
                  setInfo(null)
                }}
              >
                Rekisteröidy
              </button>
            </>
          ) : (
            <>
              Onko sinulla jo tili?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => {
                  setMode('login')
                  setError(null)
                  setInfo(null)
                }}
              >
                Kirjaudu
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
