'use client'

import { useEffect, useState } from 'react'
import { UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateUsernameForUser, type Profile } from '@/lib/auth-profile'
import {
  formatShortRealName,
  resolvePublicName,
} from '@/lib/display-name'

type ProfileModalProps = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  userId: string | null
  onSaved: () => Promise<void> | void
}

export function ProfileModal({
  open,
  onClose,
  profile,
  userId,
  onSaved,
}: ProfileModalProps) {
  const [username, setUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setUsername(profile?.username ?? '')
    setError(null)
    setSuccess(null)
  }, [open, profile?.username])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const googleFallback = formatShortRealName(profile?.display_name)
  const preview = resolvePublicName({
    username: username.trim() || null,
    displayName: profile?.display_name,
    email: profile?.email,
  })

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) return

    setSaving(true)
    setError(null)
    setSuccess(null)

    const result = await updateUsernameForUser(userId, username)
    setSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setSuccess('Nimimerkki tallennettu.')
    await onSaved()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label="Sulje profiili"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="relative z-10 w-full max-w-md rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary">
              <UserRound className="size-5" />
            </span>
            <div>
              <h2 id="profile-title" className="text-base font-semibold">
                Profiili
              </h2>
              <p className="text-xs text-muted-foreground">
                Valitse nimimerkki tulostaulukkoa varten
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Sulje"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Nimimerkki
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={googleFallback}
              maxLength={24}
              autoComplete="nickname"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Jos jätät tyhjäksi, näytetään Google-nimi muodossa{' '}
              <span className="font-medium text-foreground">{googleFallback}</span>.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
            Näkyy muille:{' '}
            <span className="font-semibold text-foreground">{preview}</span>
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--no)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-[var(--yes)]">
              {success}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 rounded-xl"
              onClick={onClose}
            >
              Sulje
            </Button>
            <Button
              type="submit"
              className="h-10 flex-1 rounded-xl"
              disabled={saving || !userId}
            >
              {saving ? 'Tallennetaan...' : 'Tallenna'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
