import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseResolveDone, runSportsScript } from '@/lib/run-sports-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Admin-triggered sports resolution (MLB + Superpesis).
 * Closes started games, then resolves finished ones and pays Fyrkka.
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: isAdmin, error: adminErr } = await userClient.rpc('is_admin')
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    await runSportsScript('sync-mlb-odds.mjs')
    await runSportsScript('sync-superpesis-odds.mjs')

    const mlb = await runSportsScript('resolve-mlb-markets.mjs')
    const sp = await runSportsScript('resolve-superpesis-markets.mjs')

    const mlbStats = parseResolveDone(mlb.stdout)
    const spStats = parseResolveDone(sp.stdout)

    if (mlb.code !== 0 && sp.code !== 0) {
      return NextResponse.json(
        {
          error: mlb.stderr || sp.stderr || mlb.stdout || sp.stdout || 'resolve failed',
          mlb: mlbStats,
          superpesis: spStats,
        },
        { status: 500 }
      )
    }

    const resolved = (mlbStats?.resolved || 0) + (spStats?.resolved || 0)
    const pending = (mlbStats?.pending || 0) + (spStats?.pending || 0)
    const failed = (mlbStats?.failed || 0) + (spStats?.failed || 0)

    return NextResponse.json({
      ok: true,
      resolved,
      pending,
      failed,
      mlb: mlbStats,
      superpesis: spStats,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/resolve-sports]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
