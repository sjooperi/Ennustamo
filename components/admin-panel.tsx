'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import {
  checkIsAdmin,
  createMarket,
  deleteMarket,
  fetchPendingMarkets,
  fetchResolutions,
  fetchResolvedMarkets,
  optionLabel,
  resolveMarket,
  rollbackResolution,
  updateMarket,
  type AdminMarket,
  type MarketResolution,
} from '@/lib/admin'
import { getPrices, formatPct } from '@/lib/amm'
import { useAuth } from '@/lib/auth-context'
import { formatFyrkka } from '@/lib/data'

const CATEGORIES = [
  'Yleinen',
  'Politiikka',
  'Talous',
  'Urheilu',
  'Viihde',
  'Teknologia',
]

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
  const [selectedOutcome, setSelectedOutcome] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  // Create / edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [category, setCategory] = useState('Yleinen')
  const [endDate, setEndDate] = useState('')
  const [optionLabels, setOptionLabels] = useState(['Kyllä', 'Ei'])
  const [optionsLocked, setOptionsLocked] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const addOption = () => {
    if (optionsLocked) return
    setOptionLabels((prev) => [...prev, ''])
  }

  const removeOption = (index: number) => {
    if (optionsLocked) return
    setOptionLabels((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)))
  }

  const updateOption = (index: number, value: string) => {
    setOptionLabels((prev) => prev.map((label, i) => (i === index ? value : label)))
  }

  const resetForm = () => {
    setEditingId(null)
    setQuestion('')
    setEndDate('')
    setCategory('Yleinen')
    setOptionLabels(['Kyllä', 'Ei'])
    setOptionsLocked(false)
  }

  const toDatetimeLocalValue = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startEdit = (market: AdminMarket) => {
    setActionError(null)
    setActionOk(null)
    setEditingId(market.id)
    setQuestion(market.title)
    setCategory(market.category || 'Yleinen')
    setEndDate(toDatetimeLocalValue(market.end_date))
    setOptionLabels(market.options.map((o) => o.label))
    setOptionsLocked(false)
    // Soft lock UI until we know — allow add/remove; server enforces if bets exist
    // Better UX: assume locked only when user tries and fails. Or check bets count.
    // Keep unlocked in UI; show note that count may be locked after bets.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setActionError(null)
    setActionOk(null)

    const labels = optionLabels.map((o) => o.trim()).filter(Boolean)
    if (question.trim().length < 3) {
      setActionError('Kirjoita kysymys (vähintään 3 merkkiä).')
      return
    }
    if (labels.length < 2) {
      setActionError('Lisää vähintään kaksi vastausvaihtoehtoa.')
      return
    }

    const payload = {
      title: question.trim(),
      options: labels,
      category: category === 'Yleinen' ? null : category,
      endDate: endDate ? new Date(endDate).toISOString() : null,
    }

    setSaving(true)
    const result = editingId
      ? await updateMarket({ id: editingId, ...payload })
      : await createMarket(payload)
    setSaving(false)

    if (!result.ok) {
      if (result.error.includes('vetoja')) {
        setOptionsLocked(true)
      }
      setActionError(result.error)
      return
    }

    setActionOk(
      editingId
        ? `Kohde päivitetty: “${result.market.title}”`
        : `Kohde luotu: “${result.market.title}”`
    )
    resetForm()
    await refresh()
  }

  const handleResolve = async (marketId: string) => {
    const outcome = selectedOutcome[marketId]
    if (!outcome) {
      setActionError('Valitse ensin voittava vaihtoehto.')
      return
    }

    setBusyId(marketId)
    setActionError(null)
    setActionOk(null)

    const market = pending.find((m) => m.id === marketId)
    const result = await resolveMarket(marketId, outcome)
    setBusyId(null)

    if (!result.ok) {
      setActionError(result.error)
      return
    }

    setActionOk(
      `Kohde ratkaistu: ${market ? optionLabel(market, outcome) : outcome}. Maksettu ${formatFyrkka(Math.round(result.resolution.total_payout))} Fyrkkaa ${result.resolution.winner_count} voittajalle.`
    )
    await refreshProfile()
    await refresh()
  }

  const handleDelete = async (market: AdminMarket) => {
    const ok = window.confirm(
      `Poista kohde “${market.title}”? Se merkitään peruutetuksi eikä näy enää etusivulla.`
    )
    if (!ok) return

    setBusyId(market.id)
    setActionError(null)
    setActionOk(null)

    const result = await deleteMarket(market.id)
    setBusyId(null)

    if (!result.ok) {
      setActionError(result.error)
      return
    }

    setActionOk(`Kohde poistettu: “${market.title}”`)
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
          Kirjaudu sisään ylläpitäjätilillä jatkaaksesi.
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
        <AlertTriangle className="mx-auto size-8 text-[var(--no)]" />
        <h1 className="mt-3 text-lg font-semibold">Ei käyttöoikeutta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Olet kirjautunut, mutta tililläsi ei ole admin-oikeuksia.
        </p>
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
            Luo uusia kohteita, ratkaise tulokset ja tilitä Fyrkat voittajille.
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {editingId ? 'Muokkaa kohdetta' : 'Luo uusi kohde'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 text-[11px] font-semibold text-foreground"
            >
              <X className="size-3.5" />
              Peruuta muokkaus
            </button>
          )}
        </div>
        <form
          onSubmit={(e) => void handleSave(e)}
          className="space-y-4 rounded-xl border border-border bg-card p-4"
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Kysymys</span>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Kuka voittaa Selviytyjät?"
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              required
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Kategoria</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Päättymisaika (valinnainen)
              </span>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Vastausvaihtoehdot
              </span>
              <button
                type="button"
                onClick={addOption}
                disabled={optionsLocked}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 text-[11px] font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="size-3.5" />
                Lisää vaihtoehto
              </button>
            </div>
            <div className="space-y-2">
              {optionLabels.map((label, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-[11px] text-muted-foreground">
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={
                      index === 0
                        ? 'Esim. Kyllä / Kilpailija A'
                        : index === 1
                          ? 'Esim. Ei / Kilpailija B'
                          : `Vaihtoehto ${index + 1}`
                    }
                    className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    disabled={optionLabels.length <= 2 || optionsLocked}
                    aria-label="Poista vaihtoehto"
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {editingId
                ? 'Voit muuttaa kysymystä, kategoriaa, päättymisaikaa ja vaihtoehtojen nimiä. Jos kohteella on jo vetoja, vaihtoehtojen määrää ei voi muuttaa.'
                : 'Kaksi vaihtoehtoa → KYLLÄ/EI-tyylinen AMM. Useampi vaihtoehto → multi-vedonlyönti.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editingId ? (
              <Pencil className="size-4" />
            ) : (
              <Plus className="size-4" />
            )}
            {editingId ? 'Tallenna muutokset' : 'Tallenna kohde'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Avoimet kohteet ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Ei avoimia kohteita. Luo ensimmäinen yllä.
          </p>
        ) : (
          pending.map((market) => {
            const { yesPrice, noPrice } = getPrices(market.yes_pool, market.no_pool)
            const outcome = selectedOutcome[market.id]
            const endMs = market.end_date
              ? new Date(market.end_date).getTime()
              : null
            const ended = endMs === null || endMs <= Date.now()
            const isBinary =
              market.options.length === 2 &&
              market.options.some((o) => o.key === 'YES') &&
              market.options.some((o) => o.key === 'NO')

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
                      Vaihtoehdot:{' '}
                      {market.options.map((o) => o.label).join(' · ')}
                    </p>
                    {isBinary && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Markkinahinta:{' '}
                        <span className="text-[var(--yes)]">
                          {formatPct(yesPrice)} {optionLabel(market, 'YES')}
                        </span>
                        {' · '}
                        <span className="text-[var(--no)]">
                          {formatPct(noPrice)} {optionLabel(market, 'NO')}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === market.id}
                      onClick={() => startEdit(market)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 text-xs font-semibold text-foreground disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" />
                      Muokkaa
                    </button>
                    <button
                      type="button"
                      disabled={busyId === market.id}
                      onClick={() => void handleDelete(market)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 text-xs font-semibold text-[var(--no)] disabled:opacity-50"
                    >
                      {busyId === market.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Poista
                    </button>
                  </div>
                </div>

                <div
                  className={`mt-3 grid gap-2 ${
                    market.options.length <= 2
                      ? 'grid-cols-2'
                      : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  {market.options.map((opt) => {
                    const selected = outcome === opt.key
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setSelectedOutcome((prev) => ({
                            ...prev,
                            [market.id]: opt.key,
                          }))
                        }
                        className={`h-10 rounded-xl px-2 text-xs font-semibold ring-1 ring-inset transition-all ${
                          selected
                            ? 'bg-primary text-primary-foreground ring-primary'
                            : 'bg-secondary text-foreground ring-border'
                        }`}
                      >
                        {opt.label} voitti
                      </button>
                    )
                  })}
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
                      <span className="font-semibold text-[var(--yes)]">
                        {optionLabel(market, market.winning_option)}
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
                  <div className="flex flex-wrap gap-2">
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
                    <button
                      type="button"
                      disabled={busyId === market.id}
                      onClick={() => void handleDelete(market)}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 text-xs font-semibold text-[var(--no)] disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      Poista
                    </button>
                  </div>
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
                      {market
                        ? optionLabel(market, res.winning_option)
                        : res.winning_option}{' '}
                      · admin{' '}
                      <span className="font-mono">{res.resolved_by.slice(0, 8)}</span>
                    </p>
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
