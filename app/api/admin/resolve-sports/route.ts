import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseResolveDone, runMlbScript } from '@/lib/run-mlb-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Admin-triggered sports resolution (MLB).
 * Uses MLB Stats API results → resolve_market_system (pays Fyrkka).
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
    // Close started games first, then resolve finals
    await runMlbScript('sync-mlb-odds.mjs')
    const { code, stdout, stderr } = await runMlbScript('resolve-mlb-markets.mjs')
    const stats = parseResolveDone(stdout)
    if (code !== 0) {
      return NextResponse.json(
        { error: stderr || stdout || 'resolve failed', ...stats },
        { status: 500 }
      )
    }
    return NextResponse.json({
      ok: true,
      ...(stats || { resolved: 0, pending: 0, failed: 0 }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin/resolve-sports]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
