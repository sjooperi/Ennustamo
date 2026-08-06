import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { normalizeUsername, validateUsername } from '@/lib/display-name'

export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  username: string | null
  avatar_url: string | null
  balance: number
  fyrkat: number
  is_admin: boolean
}

export const STARTING_BALANCE = 1000

type ProfileRow = {
  id: string
  email?: string | null
  display_name?: string | null
  username?: string | null
  avatar_url?: string | null
  balance?: number | string | null
  fyrkat?: number | string | null
  is_admin?: boolean | null
}

function displayNameFromUser(user: User): string {
  const meta = user.user_metadata ?? {}
  return (
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    (typeof meta.user_name === 'string' && meta.user_name) ||
    user.email?.split('@')[0] ||
    'pelaaja'
  )
}

function avatarFromUser(user: User): string | null {
  const meta = user.user_metadata ?? {}
  if (typeof meta.avatar_url === 'string' && meta.avatar_url) return meta.avatar_url
  if (typeof meta.picture === 'string' && meta.picture) return meta.picture
  return null
}

function mapRow(row: ProfileRow, user?: User): Profile {
  const balance = Number(row.balance ?? row.fyrkat ?? STARTING_BALANCE)
  const fyrkat = Number(row.fyrkat ?? row.balance ?? STARTING_BALANCE)
  const googleName = user ? displayNameFromUser(user) : null
  return {
    id: row.id,
    email: row.email ?? user?.email ?? null,
    display_name: row.display_name || googleName,
    username: row.username?.trim() ? row.username.trim() : null,
    avatar_url: row.avatar_url ?? (user ? avatarFromUser(user) : null),
    balance,
    fyrkat,
    is_admin: Boolean(row.is_admin),
  }
}

/** Load profile or create one (email signup, Google OAuth, legacy users). */
export async function ensureProfileForUser(user: User): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, username, avatar_url, balance, fyrkat, is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    if (
      error.message?.includes('email') ||
      error.message?.includes('display_name') ||
      error.message?.includes('is_admin') ||
      error.code === '42703'
    ) {
      const fallback = await supabase
        .from('profiles')
        .select('id, username, avatar_url, balance, fyrkat')
        .eq('id', user.id)
        .maybeSingle()
      if (fallback.data) return mapRow(fallback.data, user)
    } else if (error.code !== 'PGRST205') {
      console.error('Failed to load profile:', error.message)
    }
    return null
  }

  if (data) {
    const profile = mapRow(data, user)
    const googleName = displayNameFromUser(user)

    if (!data.display_name && googleName) {
      await supabase
        .from('profiles')
        .update({ display_name: googleName, updated_at: new Date().toISOString() })
        .eq('id', user.id)
      profile.display_name = googleName
    }

    return profile
  }

  const name = displayNameFromUser(user)
  const payload = {
    id: user.id,
    email: user.email,
    display_name: name,
    username: null as string | null,
    avatar_url: avatarFromUser(user),
    balance: STARTING_BALANCE,
    fyrkat: STARTING_BALANCE,
  }

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(payload)
    .select('id, email, display_name, username, avatar_url, balance, fyrkat, is_admin')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, email, display_name, username, avatar_url, balance, fyrkat, is_admin')
        .eq('id', user.id)
        .maybeSingle()
      if (retry) return mapRow(retry, user)
    }

    if (
      insertError.message?.includes('email') ||
      insertError.message?.includes('display_name') ||
      insertError.code === 'PGRST204' ||
      insertError.code === '42703'
    ) {
      const { data: legacy, error: legacyError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          username: null,
          avatar_url: avatarFromUser(user),
          balance: STARTING_BALANCE,
          fyrkat: STARTING_BALANCE,
        })
        .select('id, username, avatar_url, balance, fyrkat')
        .single()

      if (!legacyError && legacy) return mapRow(legacy, user)
      if (legacyError) {
        console.error('Failed to create legacy profile:', legacyError.message)
      }
    } else if (insertError.code !== 'PGRST205' && insertError.code !== '42501') {
      console.error('Failed to create profile:', insertError.message)
    }

    return {
      id: user.id,
      email: user.email ?? null,
      display_name: name,
      username: null,
      avatar_url: avatarFromUser(user),
      balance: STARTING_BALANCE,
      fyrkat: STARTING_BALANCE,
      is_admin: false,
    }
  }

  return mapRow(created, user)
}

export async function updateUsernameForUser(
  userId: string,
  rawUsername: string
): Promise<{ ok: true; username: string | null } | { ok: false; error: string }> {
  const trimmed = normalizeUsername(rawUsername)

  // Empty input clears custom nickname → fallback to Google short name.
  if (!trimmed) {
    const { error } = await supabase
      .from('profiles')
      .update({
        username: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      console.error('Failed to clear username:', error.message)
      return { ok: false, error: 'Nimimerkin tyhjennys epäonnistui.' }
    }
    return { ok: true, username: null }
  }

  const validationError = validateUsername(trimmed)
  if (validationError) return { ok: false, error: validationError }

  const { error } = await supabase
    .from('profiles')
    .update({
      username: trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Nimimerkki on jo käytössä. Valitse toinen.' }
    }
    console.error('Failed to update username:', error.message)
    return { ok: false, error: 'Nimimerkin tallennus epäonnistui.' }
  }

  return { ok: true, username: trimmed }
}
