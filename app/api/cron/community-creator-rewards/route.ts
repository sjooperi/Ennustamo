import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type PeriodKind = 'week' | 'month' | 'auto'

function resolveKinds(request: Request): Array<'week' | 'month'> {
  const url = new URL(request.url)
  const kind = (url.searchParams.get('kind') || 'auto') as PeriodKind

  if (kind === 'week' || kind === 'month') return [kind]

  // Daily cron: Mondays → previous week; 1st of month → previous month.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Helsinki',
    weekday: 'short',
    day: 'numeric',
  }).formatToParts(new Date())

  const weekday = parts.find((p) => p.type === 'weekday')?.value
  const day = Number(parts.find((p) => p.type === 'day')?.value || 0)
  const kinds: Array<'week' | 'month'> = []
  if (weekday === 'Mon') kinds.push('week')
  if (day === 1) kinds.push('month')
  return kinds
}

/** Award top community market creators for the previous week and/or month. */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const kinds = resolveKinds(request)
  if (kinds.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'not_scheduled_day',
    })
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const results: Record<string, unknown> = {}
    for (const kind of kinds) {
      const { data, error } = await supabase.rpc('award_community_creator_rewards', {
        p_period_kind: kind,
      })
      if (error) {
        return NextResponse.json(
          { error: error.message, failed_kind: kind, results },
          { status: 500 }
        )
      }
      results[kind] = data
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
