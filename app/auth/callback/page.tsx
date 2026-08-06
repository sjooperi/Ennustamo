'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import { ensureProfileForUser } from '@/lib/auth-profile'
import { consumeAuthReturnPath, supabase } from '@/lib/supabase'

/**
 * Single place that exchanges the OAuth/email PKCE `code` for a session.
 * Guarded against React Strict Mode double-invoke.
 * Returns to the page where login started (e.g. /admin).
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Viimeistellään kirjautumista...')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    let cancelled = false

    const goNext = () => {
      const next = consumeAuthReturnPath('/')
      router.replace(next)
    }

    async function finishAuth() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        const errorDescription =
          url.searchParams.get('error_description') || url.searchParams.get('error')

        if (errorDescription) {
          if (!cancelled) {
            setMessage(decodeURIComponent(errorDescription.replace(/\+/g, ' ')))
          }
          window.setTimeout(() => router.replace('/?authError=1'), 2200)
          return
        }

        // Prefer existing session (e.g. already established)
        {
          const {
            data: { session: existing },
          } = await supabase.auth.getSession()
          if (existing?.user) {
            await ensureProfileForUser(existing.user)
            if (!cancelled) setMessage('Kirjautuminen onnistui. Siirretään...')
            window.history.replaceState({}, '', '/auth/callback')
            goNext()
            return
          }
        }

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code)

          if (error) {
            // Code may already be consumed (Strict Mode / double navigation)
            const {
              data: { session: fallback },
            } = await supabase.auth.getSession()
            if (fallback?.user) {
              await ensureProfileForUser(fallback.user)
              if (!cancelled) setMessage('Kirjautuminen onnistui. Siirretään...')
              goNext()
              return
            }
            throw error
          }

          if (data.user) {
            await ensureProfileForUser(data.user)
          }

          window.history.replaceState({}, '', '/auth/callback')
        } else {
          if (!cancelled) {
            setMessage('Istuntoa ei löytynyt. Palaa etusivulle ja yritä uudelleen.')
          }
          window.setTimeout(() => router.replace('/'), 1800)
          return
        }

        if (!cancelled) {
          setMessage('Kirjautuminen onnistui. Siirretään...')
        }
        goNext()
      } catch (err) {
        const text =
          err instanceof Error ? err.message : 'Kirjautuminen epäonnistui.'
        if (!cancelled) {
          setMessage(
            text.includes('exchange')
              ? 'Google-kirjautumisen vahvistus epäonnistui. Sulje ikkuna ja yritä uudelleen (älä päivitä callback-sivua).'
              : text
          )
        }
        window.setTimeout(() => router.replace('/?authError=1'), 2500)
      }
    }

    void finishAuth()

    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
          <TrendingUp className="size-6" strokeWidth={2.5} />
        </span>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
