'use client'

import { Coins, LogOut, Menu, Search, Shield, Trophy, TrendingUp, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LeaderboardModal } from '@/components/leaderboard-modal'
import { MarketWizardBadge } from '@/components/market-wizard-badge'
import { NotificationsMenu } from '@/components/notifications-menu'
import { ProfileModal } from '@/components/profile-modal'
import { useAuth } from '@/lib/auth-context'
import {
  MARKET_WIZARD_BADGE,
  MARKET_WIZARD_BADGE_LABEL,
} from '@/lib/community'
import { formatFyrkka } from '@/lib/data'
import {
  initialsFromPublicName,
  resolvePublicName,
} from '@/lib/display-name'

const NAV_LINKS = [
  { label: 'Markkinat', href: '/' },
  { label: 'Tulostaulukko', href: '#leaderboard', action: 'leaderboard' as const },
  { label: 'Säännöt', href: '#' },
  { label: 'Hallinta', href: '/admin', action: 'admin' as const },
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

  const navLinks = NAV_LINKS.filter(
    (link) => link.action !== 'admin' || Boolean(profile?.is_admin)
  )

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
      <header className="sticky top-0 z-50 w-full max-w-full border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-7xl min-w-0 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8">
          <a href="/" className="flex min-w-0 shrink-0 items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <TrendingUp className="size-5" strokeWidth={2.5} />
            </span>
            <span className="hidden text-lg font-semibold tracking-tight sm:inline">
              Ennustamo
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navLinks.map((link, i) =>
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
              ) : link.action === 'admin' ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  <Shield className="size-3.5" />
                  {link.label}
                </a>
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

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-3">
            {/* Always visible on mobile: open leaderboard */}
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl text-primary md:hidden"
              aria-label="Tulostaulukko"
              onClick={openLeaderboard}
            >
              <Trophy className="size-5" />
            </Button>

            {ready && user ? (
              <>
                <div className="flex max-w-[7.5rem] items-center gap-1 rounded-xl border border-primary/25 bg-primary/10 px-2 py-1.5 text-sm font-semibold text-primary sm:max-w-none sm:gap-1.5 sm:px-2.5">
                  <Coins className="size-4 shrink-0" />
                  <span className="truncate font-mono tabular-nums">
                    {formatFyrkka(Math.round(balance))}
                  </span>
                  <span className="hidden font-normal text-primary/80 sm:inline">
                    Fyrkkaa
                  </span>
                </div>

                <NotificationsMenu />

                <button
                  type="button"
                  title={
                    profile?.badges?.includes(MARKET_WIZARD_BADGE)
                      ? `${publicName} · ${MARKET_WIZARD_BADGE_LABEL}`
                      : `${publicName} · muokkaa profiilia`
                  }
                  onClick={openProfile}
                  aria-label="Avaa profiili"
                  className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.18_265)] text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {initialsFromPublicName(publicName)}
                  {profile?.badges?.includes(MARKET_WIZARD_BADGE) ? (
                    <span className="absolute -right-1.5 -bottom-1.5 rounded-full ring-2 ring-background">
                      <MarketWizardBadge size="md" />
                    </span>
                  ) : null}
                </button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden size-9 rounded-xl sm:inline-flex"
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
                  className="h-9 rounded-xl px-2.5 sm:px-3"
                  onClick={() => openAuth('register')}
                >
                  <UserRound className="size-4" />
                  <span className="hidden sm:inline">Luo tili</span>
                </Button>
              </>
            ) : (
              <div className="h-9 w-16 animate-pulse rounded-xl bg-secondary sm:w-24" />
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

        {/* Mobile: horizontally scrollable nav chips */}
        <nav
          aria-label="Päänavigaatio"
          className="flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain border-t border-border/60 px-3 py-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navLinks.map((link, i) =>
            link.action === 'leaderboard' ? (
              <button
                key={link.label}
                type="button"
                onClick={openLeaderboard}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
              >
                <Trophy className="size-3.5" />
                {link.label}
              </button>
            ) : link.action === 'admin' ? (
              <a
                key={link.label}
                href={link.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-semibold text-primary"
              >
                <Shield className="size-3.5" />
                {link.label}
              </a>
            ) : (
              <a
                key={link.label}
                href={link.href}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === 0
                    ? 'bg-secondary text-foreground'
                    : 'bg-secondary/60 text-muted-foreground'
                }`}
              >
                {link.label}
              </a>
            )
          )}
        </nav>

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
            {navLinks.map((link) =>
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
              ) : link.action === 'admin' ? (
                <a
                  key={link.label}
                  href={link.href}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-secondary"
                >
                  <Shield className="size-4" />
                  {link.label}
                </a>
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
