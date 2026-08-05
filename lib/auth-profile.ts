import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type Profile = {
  id: string
  email: string | null
  display_name: string | null
  username: string | null
  avatar_url: string | null
  balance: number
  fyrkat: number
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
  return {
    id: row.id,
    email: row.email ?? user?.email ?? null,
    display_name:
      row.display_name || row.username || (user ? displayNameFromUser(user) : null),
    username: row.username ?? null,
    avatar_url: row.avatar_url ?? (user ? avatarFromUser(user) : null),
    balance,
    fyrkat,
  }
}

/** Load profile or create one (email signup, Google OAuth, legacy users). */
export async function ensureProfileForUser(user: User): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, username, avatar_url, balance, fyrkat')
    .eq('id', user.id)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    // Older schema without email/display_name — try minimal select
    if (
      error.message?.includes('email') ||
      error.message?.includes('display_name') ||
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
    return mapRow(data, user)
  }

  const name = displayNameFromUser(user)
  const payload = {
    id: user.id,
    email: user.email,
    display_name: name,
    username: name,
    avatar_url: avatarFromUser(user),
    balance: STARTING_BALANCE,
    fyrkat: STARTING_BALANCE,
  }

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(payload)
    .select('id, email, display_name, username, avatar_url, balance, fyrkat')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: retry } = await supabase
        .from('profiles')
        .select('id, email, display_name, username, avatar_url, balance, fyrkat')
        .eq('id', user.id)
        .maybeSingle()
      if (retry) return mapRow(retry, user)
    }

    // Schema without email/display_name columns
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
          username: name,
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
      username: name,
      avatar_url: avatarFromUser(user),
      balance: STARTING_BALANCE,
      fyrkat: STARTING_BALANCE,
    }
  }

  return mapRow(created, user)
}
