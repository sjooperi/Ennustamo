'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Shield,
  Trophy,
} from 'lucide-react'
import {
  checkIsAdmin,
  fetchPendingMarkets,
  fetchResolutions,
  fetchResolvedMarkets,
  resolveMarket,
  rollbackResolution,
  type AdminMarket,
  type MarketResolution,
} from '@/lib/admin'
import { getPrices, formatPct } from '@/lib/amm'
import { useAuth } from '@/lib/auth-context'
import { formatFyrkka } from '@/lib/data'

type Outcome = 'YES' | 'NO'

export function AdminPanel() {
  const { user, ready, openAuth, refreshProfile, profile } = useAuth()
  const [rpcAdmin, setRpcAdmin] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const [pending, setPending] = useState<AdminMarket[]>([])
  const [resolved, setResolved] = useState<AdminMarket[]>([])
  const [resolutions, setResolutions] = useState<MarketResolution[]>([])
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, Outcome>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const isAdmin = Boolean(profile?.is_admin) || rpcAdmin === true

  const refresh = useCallback(async () => {
    setLoading(true)
    setActionError(null)
    try {
      const [p, r, logs] = await Promise.all([
        fetchPendingMarkets(),
        fetchResolvedMarkets(),
        fetchResolutions(),
      ])
      setPending(p)
      setResolved(r)
      setResolutions(logs)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Lataus epäonnistui')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!user) {
      setRpcAdmin(false)
      setChecking(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setChecking(true)
      await refreshProfile()
      const admin = await checkIsAdmin()
      if (cancelled) return
      setRpcAdmin(admin)
      setChecking(false)
    })()

    return () => {
      cancelled = true
    }
  }, [ready, user, refreshProfile])

  useEffect(() => {
    if (!ready || checking) return
    if (isAdmin) void refresh()
  }, [ready, checking, isAdmin, refresh])

  const handleResolve = async (marketId: string) => {
    const outcome = selectedOutcome[marketId]
    if (!outcome) {
      setActionError('Valitse ensin lopputulos (KYLLÄ / EI).')
      return
    }

    setBusyId(marketId)
    setActionError(null)
    setActionOk(null)

    const result = await resolveMarket(marketId, outcome)
    setBusyId(null)

    if (!result.ok) {
      setActionError(result.error)
      return
    }

    setActionOk(
      `Kohde ratkaistu: ${outcome === 'YES' ? 'KYLLÄ' : 'EI'}. Maksettu ${formatFyrkka(Math.round(result.resolution.total_payout))} Fyrkkaa ${result.resolution.winner_count} voittajalle.`
    )
    await refreshProfile()
    await refresh()
  }

  const handleRollback = async (resolutionId: string, marketTitle: string) => {
    const ok = window.confirm(
      `Peruuta ratkaisu kohteelle "${marketTitle}"? Voittajien saldot vähennetään ja kohde avataan uudelleen.`
    )
    if (!ok) return

    setBusyId(resolutionId)
    setActionError(null)
    setActionOk(null)

    const result = await rollbackResolution(resolutionId, 'Admin rollback UI')
    setBusyId(null)

    if (!result.ok) {
      setActionError(result.error)
      return
    }

    setActionOk('Ratkaisu peruttu. Saldot palautettu ja kohde avattu.')
    await refreshProfile()
    await refresh()
  }

  if (!ready || checking) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Tarkistetaan oikeuksia...
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center">
        <p className="mb-3 rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
          Olet sivulla <span className="text-foreground">/admin</span>
        </p>
        <Shield className="mx-auto size-8 text-primary" />
        <h1 className="mt-3 text-lg font-semibold">Hallintapaneeli</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kirjaudu sisään ylläpitäjätilillä jatkaaksesi. Etusivulle ei ole
          ohjattu — tämä on hallintasivu.
        </p>
        <button
          type="button"
          onClick={() => openAuth('login')}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Kirjaudu
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center">
        <p className="mb-3 rounded-lg bg-secondary px-3 py-1.5 text-[11px] font-mono text-muted-foreground">
          Olet sivulla <span className="text-foreground">/admin</span>
        </p>
        <AlertTriangle className="mx-auto size-8 text-[var(--no)]" />
        <h1 className="mt-3 text-lg font-semibold">Ei käyttöoikeutta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Olet kirjautunut, mutta tililläsi ei ole admin-oikeuksia.
        </p>
        <ol className="mt-4 space-y-2 text-left text-sm text-muted-foreground">
          <li>
            1. Aja Supabase SQL Editorissa (oma email):
            <pre className="mt-1 overflow-x-auto rounded-lg bg-background p-2 text-[11px] text-foreground">{`update public.profiles
set is_admin = true
where email = '${user.email ?? 'oma@email.com'}';`}</pre>
          </li>
          <li>2. Varmista että migraatio <code className="text-foreground">008_market_resolution.sql</code> on ajettu.</li>
          <li>3. Päivitä tämä sivu (F5) tai kirjaudu ulos ja takaisin.</li>
        </ol>
        <a
          href="/"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-border bg-secondary px-4 text-sm font-semibold text-foreground"
        >
          Takaisin markkinoille
        </a>
      </div>
    )
  }

  const activeResolutionByMarket = new Map<string, MarketResolution>()
  for (const res of resolutions) {
    if (!res.rolled_back && !activeResolutionByMarket.has(res.market_id)) {
      activeResolutionByMarket.set(res.market_id, res)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 text-primary">
            <Shield className="size-5" />
            <span className="text-xs font-semibold uppercase tracking-wide">Admin</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Hallintapaneeli</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ratkaise avoimet kohteet ja tilitä Fyrkat voittajille. AMM: 1 osake = 1 F
            palautus. Voit ratkaista myös vielä käynnissä olevan kohteen.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-xs font-semibold text-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Päivitä
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 py-2 text-sm text-[var(--no)]"
        >
          {actionError}
        </div>
      )}
      {actionOk && (
        <div
          role="status"
          className="rounded-xl border border-[var(--yes)]/30 bg-[var(--yes)]/10 px-3 py-2 text-sm text-[var(--yes)]"
        >
          {actionOk}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Avoimet kohteet ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Ei avoimia kohteita. Jos etusivulla näkyy markkinoita, tarkista että
            migraatio 008 on ajettu ja status = open.
          </p>
        ) : (
          pending.map((market) => {
            const { yesPrice, noPrice } = getPrices(market.yes_pool, market.no_pool)
            const outcome = selectedOutcome[market.id]
            const endMs = market.end_date
              ? new Date(market.end_date).getTime()
              : null
            const ended = endMs === null || endMs <= Date.now()
            return (
              <article
                key={market.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-primary">
                      {market.category || 'Yleinen'}
                      {market.end_date
                        ? ended
                          ? ` · päättyi ${new Date(market.end_date).toLocaleString('fi-FI')}`
                          : ` · päättyy ${new Date(market.end_date).toLocaleString('fi-FI')}`
                        : ' · ei päättymispäivää'}
                      {!ended && (
                        <span className="ml-1.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          vielä auki
                        </span>
                      )}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold leading-snug">
                      {market.title}
                    </h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Markkinahinta:{' '}
                      <span className="text-[var(--yes)]">{formatPct(yesPrice)} KYLLÄ</span>
                      {' · '}
                      <span className="text-[var(--no)]">{formatPct(noPrice)} EI</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedOutcome((prev) => ({ ...prev, [market.id]: 'YES' }))
                    }
                    className={`h-10 rounded-xl text-xs font-semibold ring-1 ring-inset transition-all ${
                      outcome === 'YES'
                        ? 'bg-[var(--yes)] text-[var(--yes-foreground)] ring-[var(--yes)]'
                        : 'bg-[var(--yes)]/12 text-[var(--yes)] ring-[var(--yes)]/25'
                    }`}
                  >
                    KYLLÄ voitti
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedOutcome((prev) => ({ ...prev, [market.id]: 'NO' }))
                    }
                    className={`h-10 rounded-xl text-xs font-semibold ring-1 ring-inset transition-all ${
                      outcome === 'NO'
                        ? 'bg-[var(--no)] text-[var(--no-foreground)] ring-[var(--no)]'
                        : 'bg-[var(--no)]/12 text-[var(--no)] ring-[var(--no)]/25'
                    }`}
                  >
                    EI voitti
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!outcome || busyId === market.id}
                  onClick={() => void handleResolve(market.id)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busyId === market.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Vahvista ratkaisu
                </button>
              </article>
            )
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Ratkaistut kohteet ({resolved.length})
        </h2>
        {resolved.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Ei vielä ratkaistuja kohteita.
          </p>
        ) : (
          resolved.map((market) => {
            const res = activeResolutionByMarket.get(market.id)
            return (
              <article
                key={market.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">
                      {market.resolved_at
                        ? new Date(market.resolved_at).toLocaleString('fi-FI')
                        : '—'}
                    </p>
                    <h3 className="mt-0.5 text-sm font-semibold">{market.title}</h3>
                    <p className="mt-1 text-xs">
                      Voittaja:{' '}
                      <span
                        className={
                          market.winning_option === 'YES'
                            ? 'font-semibold text-[var(--yes)]'
                            : 'font-semibold text-[var(--no)]'
                        }
                      >
                        {market.winning_option === 'YES' ? 'KYLLÄ' : 'EI'}
                      </span>
                      {res && (
                        <span className="text-muted-foreground">
                          {' '}
                          · maksettu {formatFyrkka(Math.round(res.total_payout))} F ·{' '}
                          {res.winner_count} voittajaa
                        </span>
                      )}
                    </p>
                  </div>
                  {res && (
                    <button
                      type="button"
                      disabled={busyId === res.id}
                      onClick={() => void handleRollback(res.id, market.title)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 text-xs font-semibold text-foreground disabled:opacity-50"
                    >
                      {busyId === res.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3.5" />
                      )}
                      Peruuta ratkaisu
                    </button>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <Trophy className="size-4 text-primary" />
          Tapahtumaloki
        </h2>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {resolutions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ei vielä ratkaisutapahtumia.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {resolutions.map((res) => {
                const market =
                  resolved.find((m) => m.id === res.market_id) ||
                  pending.find((m) => m.id === res.market_id)
                return (
                  <li key={res.id} className="px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {market?.title || res.market_id.slice(0, 8)}
                      </p>
                      <span
                        className={
                          res.rolled_back
                            ? 'rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground'
                            : 'rounded-full bg-[var(--yes)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--yes)]'
                        }
                      >
                        {res.rolled_back ? 'Peruttu' : 'Aktiivinen'}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {new Date(res.resolved_at).toLocaleString('fi-FI')} · voittaja{' '}
                      {res.winning_option === 'YES' ? 'KYLLÄ' : 'EI'} · admin{' '}
                      <span className="font-mono">{res.resolved_by.slice(0, 8)}</span>
                      {res.rolled_back_at && (
                        <>
                          {' '}
                          · rollback{' '}
                          {new Date(res.rolled_back_at).toLocaleString('fi-FI')}
                        </>
                      )}
                    </p>
                    {res.notes && (
                      <p className="mt-1 text-muted-foreground">{res.notes}</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
