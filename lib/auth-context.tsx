'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthModal } from '@/components/auth-modal'
import {
  ensureProfileForUser,
  type Profile,
} from '@/lib/auth-profile'
import { supabase } from '@/lib/supabase'

type AuthMode = 'login' | 'register'

type AuthContextValue = {
  user: User | null
  session: Session | null
  profile: Profile | null
  ready: boolean
  balance: number
  openAuth: (mode?: AuthMode) => void
  closeAuth: () => void
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')

  const refreshProfile = useCallback(async () => {
    const {
      data: { user: current },
    } = await supabase.auth.getUser()

    if (!current) {
      setProfile(null)
      return
    }

    const next = await ensureProfileForUser(current)
    setProfile(next)
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        const next = await ensureProfileForUser(data.session.user)
        if (mounted) setProfile(next)
      }
      if (mounted) setReady(true)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setReady(true)

      if (nextSession?.user) {
        // Avoid deadlocks: defer profile fetch outside the auth callback.
        window.setTimeout(() => {
          void ensureProfileForUser(nextSession.user!).then((next) => {
            if (mounted) setProfile(next)
          })
        }, 0)
      } else {
        setProfile(null)
      }

      if (event === 'SIGNED_IN') {
        setAuthOpen(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setAuthMode(mode)
    setAuthOpen(true)
  }, [])

  const closeAuth = useCallback(() => {
    setAuthOpen(false)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      ready,
      balance: profile?.balance ?? profile?.fyrkat ?? 0,
      openAuth,
      closeAuth,
      signOut,
      refreshProfile,
    }),
    [user, session, profile, ready, openAuth, closeAuth, signOut, refreshProfile]
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        open={authOpen}
        initialMode={authMode}
        onClose={closeAuth}
        onSuccess={() => {
          void refreshProfile()
        }}
      />
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
