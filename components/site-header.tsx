'use client'

import { Bell, Coins, LogOut, Menu, Search, Trophy, TrendingUp, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LeaderboardModal } from '@/components/leaderboard-modal'
import { ProfileModal } from '@/components/profile-modal'
import { useAuth } from '@/lib/auth-context'
import { formatFyrkka } from '@/lib/data'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'

const NAV_LINKS = [
  { label: 'Markkinat', href: '/' },
  { label: 'Tulostaulukko', href: '#leaderboard', action: 'leaderboard' as const },
  { label: 'Säännöt', href: '#' },
]

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, profile, ready, balance, openAuth, signOut, refreshProfile } = useAuth()

  const publicName = resolvePublicName({
    username: profile?.username,
    displayName: profile?.display_name,
    email: user?.email ?? profile?.email,
  })

  const handleSignOut = async () => {
    await signOut()
    setMobileOpen(false)
  }

  const openLeaderboard = () => {
    setLeaderboardOpen(true)
    setMobileOpen(false)
  }

  const openProfile = () => {
    setProfileOpen(true)
    setMobileOpen(false)
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex shrink-0 items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <TrendingUp className="size-5" strokeWidth={2.5} />
            </span>
            <span className="text-lg font-semibold tracking-tight">Ennustamo</span>
          </a>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link, i) =>
              link.action === 'leaderboard' ? (
                <button
                  key={link.label}
                  type="button"
                  onClick={openLeaderboard}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Trophy className="size-3.5" />
                  {link.label}
                </button>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    i === 0
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {link.label}
                </a>
              )
            )}
          </nav>

          <div className="relative ml-auto hidden max-w-xs flex-1 lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Etsi kohteita..."
              aria-label="Etsi kohteita"
              className="h-9 w-full rounded-xl border border-input bg-secondary/60 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
            />
          </div>

          <div className="ml-auto flex items-center gap-2 lg:ml-3">
            {ready && user ? (
              <>
                <div className="flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-sm font-semibold text-primary">
                  <Coins className="size-4" />
                  <span className="font-mono tabular-nums">
                    {formatFyrkka(Math.round(balance))}
                  </span>
                  <span className="hidden font-normal text-primary/80 sm:inline">
                    Fyrkkaa
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="relative size-9 rounded-xl"
                  aria-label="Ilmoitukset"
                >
                  <Bell className="size-5" />
                </Button>

                <button
                  type="button"
                  title={`${publicName} · muokkaa profiilia`}
                  onClick={openProfile}
                  aria-label="Avaa profiili"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.18_265)] text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {initialsFromPublicName(publicName)}
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 rounded-xl"
                  aria-label="Kirjaudu ulos"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-4" />
                </Button>
              </>
            ) : ready ? (
              <>
                <Button
                  variant="ghost"
                  className="hidden h-9 rounded-xl px-3 sm:inline-flex"
                  onClick={() => openAuth('login')}
                >
                  Kirjaudu
                </Button>
                <Button
                  className="h-9 rounded-xl px-3"
                  onClick={() => openAuth('register')}
                >
                  <UserRound className="size-4" />
                  Luo tili
                </Button>
              </>
            ) : (
              <div className="h-9 w-24 animate-pulse rounded-xl bg-secondary" />
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl md:hidden"
              aria-label="Valikko"
              onClick={() => setMobileOpen((o) => !o)}
            >
              <Menu className="size-5" />
            </Button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="border-t border-border px-4 py-3 md:hidden">
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Etsi kohteita..."
                aria-label="Etsi kohteita"
                className="h-9 w-full rounded-xl border border-input bg-secondary/60 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
              />
            </div>
            {NAV_LINKS.map((link) =>
              link.action === 'leaderboard' ? (
                <button
                  key={link.label}
                  type="button"
                  onClick={openLeaderboard}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Trophy className="size-4" />
                  {link.label}
                </button>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {link.label}
                </a>
              )
            )}
            {ready && user && (
              <button
                type="button"
                onClick={openProfile}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <UserRound className="size-4" />
                Profiili ({publicName})
              </button>
            )}
            {ready && !user && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-9 rounded-xl"
                  onClick={() => {
                    setMobileOpen(false)
                    openAuth('login')
                  }}
                >
                  Kirjaudu
                </Button>
                <Button
                  className="h-9 rounded-xl"
                  onClick={() => {
                    setMobileOpen(false)
                    openAuth('register')
                  }}
                >
                  Luo tili
                </Button>
              </div>
            )}
            {ready && user && (
              <Button
                variant="outline"
                className="mt-2 h-9 w-full rounded-xl"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                Kirjaudu ulos
              </Button>
            )}
          </nav>
        )}
      </header>

      <LeaderboardModal
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
      />

      <ProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        profile={profile}
        userId={user?.id ?? null}
        onSaved={refreshProfile}
      />
    </>
  )
}
