'use client'

import { Bell, Coins, LogOut, Menu, Search, TrendingUp, UserRound } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { formatFyrkka } from '@/lib/data'

const NAV_LINKS = ['Markkinat', 'Tulostaulukko', 'Säännöt']

function initialsFromUser(
  email: string | undefined,
  displayName: string | null | undefined
): string {
  const source = displayName || email?.split('@')[0] || '?'
  return source.slice(0, 2).toUpperCase()
}

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, profile, ready, balance, openAuth, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <TrendingUp className="size-5" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">Ennustamo</span>
        </a>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link}
              href="#"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                i === 0
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {link}
            </a>
          ))}
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

              <div
                title={user.email ?? profile?.display_name ?? 'Käyttäjä'}
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.18_265)] text-sm font-semibold text-primary-foreground"
              >
                {initialsFromUser(user.email, profile?.display_name)}
              </div>

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
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {link}
            </a>
          ))}
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
  )
}
