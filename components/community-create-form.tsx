'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import {
  COMMUNITY_CREATOR_STAKE,
  COMMUNITY_MAX_DAILY,
  COMMUNITY_MAX_OPTIONS,
  COMMUNITY_MONTHLY_CREATOR_REWARDS,
  COMMUNITY_RESOLVE_HOURS,
  COMMUNITY_TOP_CREATOR_REWARDS,
  COMMUNITY_TOPIC_CATEGORIES,
  createCommunityMarket,
  type CommunityTopicCategory,
} from '@/lib/community'
import { formatFyrkka } from '@/lib/data'

const WEEKLY_REWARD_SUMMARY = COMMUNITY_TOP_CREATOR_REWARDS.map(
  (amount, i) => `${i + 1}. ${formatFyrkka(amount)} F`
).join(' · ')

const MONTHLY_REWARD_SUMMARY = COMMUNITY_MONTHLY_CREATOR_REWARDS.map(
  (amount, i) => `${i + 1}. ${formatFyrkka(amount)} F`
).join(' · ')

type CommunityCreateFormProps = {
  balance: number
  isLoggedIn: boolean
  onLogin: () => void
  onCreated: () => void
}

export function CommunityCreateForm({
  balance,
  isLoggedIn,
  onLogin,
  onCreated,
}: CommunityCreateFormProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState(['Kyllä', 'Ei'])
  const [endDate, setEndDate] = useState('')
  const [criteria, setCriteria] = useState('')
  const [topicCategory, setTopicCategory] = useState<CommunityTopicCategory | ''>(
    ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setOptions(['Kyllä', 'Ei'])
    setEndDate('')
    setCriteria('')
    setTopicCategory('')
    setError(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setOk(null)

    if (!isLoggedIn) {
      onLogin()
      return
    }

    const labels = options.map((o) => o.trim()).filter(Boolean)
    if (title.trim().length < 3) {
      setError('Kirjoita vähintään 3 merkin kysymys.')
      return
    }
    if (!topicCategory) {
      setError('Valitse kategoria, johon kohde kuuluu.')
      return
    }
    if (labels.length < 2) {
      setError('Lisää vähintään kaksi vastausvaihtoehtoa.')
      return
    }
    if (labels.length > COMMUNITY_MAX_OPTIONS) {
      setError(`Voit asettaa enintään ${COMMUNITY_MAX_OPTIONS} vaihtoehtoa.`)
      return
    }
    if (!endDate) {
      setError('Valitse sulkeutumisaika.')
      return
    }
    const endIso = new Date(endDate).toISOString()
    if (Number.isNaN(new Date(endDate).getTime()) || new Date(endDate) <= new Date()) {
      setError('Sulkeutumisajan pitää olla tulevaisuudessa.')
      return
    }
    if (balance < COMMUNITY_CREATOR_STAKE) {
      setError(`Saldo ei riitä panttiin (${COMMUNITY_CREATOR_STAKE} Fyrkkaa).`)
      return
    }

    setSaving(true)
    const result = await createCommunityMarket({
      title: title.trim(),
      options: labels,
      endDate: endIso,
      resolutionCriteria: criteria.trim() || null,
      topicCategory,
    })
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setOk(
      `Kohde luotu. Pantti ${formatFyrkka(COMMUNITY_CREATOR_STAKE)} Fyrkkaa lukittu — palautetaan kun ratkaiset ajoissa.`
    )
    reset()
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <div className="mb-4 space-y-2 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Luo oma ennustekohde</p>
            <p className="text-[11px] text-muted-foreground">
              Pantti {COMMUNITY_CREATOR_STAKE} F · max {COMMUNITY_MAX_DAILY} / päivä · ratkaisu{' '}
              {COMMUNITY_RESOLVE_HOURS} h sulkeutumisen jälkeen
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isLoggedIn) {
                onLogin()
                return
              }
              setOpen(true)
              setOk(null)
              setError(null)
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-3.5" />
            Uusi kohde
          </button>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Viikon top 5 volyymikohteen luojat: {WEEKLY_REWARD_SUMMARY}. Kuukauden
          palkinnot 2× ({MONTHLY_REWARD_SUMMARY}), ja #1 saa badgen Kuukauden
          markkinavelho.
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Sääntöjen rikkominen (esim. harhaanjohtava kohde tai ratkaisematta jättäminen)
          johtaa pantin menettämiseen.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-4 space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Uusi yhteisökohde</h3>
          <p className="text-[11px] text-muted-foreground">
            Kohteen luominen lukitsee {COMMUNITY_CREATOR_STAKE} Fyrkkaa pantiksi. Kohde
            näkyy aina yhteisössä; viisi suosituinta yhteisön kohdetta nousevat myös
            käyttäjän valitsemaan kategoriaan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            reset()
          }}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          Peruuta
        </button>
      </div>

      <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        Viikon top 5: {WEEKLY_REWARD_SUMMARY}. Kuukauden top 5 (2×):{' '}
        {MONTHLY_REWARD_SUMMARY}. Kuukauden #1 saa badgen Kuukauden markkinavelho.
      </p>

      <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
        Sääntöjen rikkominen (harhaanjohtava sisältö, epäselvä kohde tai ratkaisematta
        jättäminen määräajassa) johtaa pantin menettämiseen.
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">Kysymys</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Esim. Voittaako puolue X ensi eduskuntavaalit?"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Kategoria (mihin aiheeseen kuuluu)
        </span>
        <select
          value={topicCategory}
          onChange={(e) =>
            setTopicCategory(e.target.value as CommunityTopicCategory | '')
          }
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
          required
        >
          <option value="">Valitse kategoria…</option>
          {COMMUNITY_TOPIC_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          Vaihtoehdot (2–{COMMUNITY_MAX_OPTIONS})
        </span>
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={opt}
              onChange={(e) =>
                setOptions((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
              className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <button
              type="button"
              disabled={options.length <= 2}
              onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground disabled:opacity-40"
              aria-label="Poista vaihtoehto"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {options.length < COMMUNITY_MAX_OPTIONS ? (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, ''])}
            className="text-[11px] font-semibold text-primary"
          >
            + Lisää vaihtoehto
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Enintään {COMMUNITY_MAX_OPTIONS} vaihtoehtoa.
          </p>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Sulkeutumisaika (vedonlyönti päättyy)
        </span>
        <input
          type="datetime-local"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
        <span className="block text-[10px] text-muted-foreground">
          Ratkaisu viimeistään {COMMUNITY_RESOLVE_HOURS} h sulkeutumisen jälkeen.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-muted-foreground">
          Miten kohde ratkaistaan?{' '}
          <span className="font-normal">(valinnainen)</span>
        </span>
        <textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          rows={3}
          placeholder="Esim. Virallinen vaalitulos Ylen mukaan. Voit jättää tyhjäksi."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {ok && (
        <p className="rounded-lg bg-[var(--yes)]/10 px-3 py-2 text-xs text-[var(--yes)]">
          {ok}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        Luo kohde (−{COMMUNITY_CREATOR_STAKE} F pantti)
      </button>
    </form>
  )
}
