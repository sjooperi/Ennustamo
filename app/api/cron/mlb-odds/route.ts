import { NextResponse } from 'next/server'
import { runMlbScript } from '@/lib/run-mlb-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Close MLB markets when game starts (open → closed). */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code, stdout, stderr } = await runMlbScript('sync-mlb-odds.mjs')
    if (code !== 0) {
      console.error('[cron/mlb-odds]', stderr || stdout)
      return NextResponse.json(
        { error: stderr || stdout || 'odds sync failed', code },
        { status: 500 }
      )
    }
    const m = stdout.match(
      /\[done\]\s+closed=(\d+)\s+reseeded=(\d+)\s+updated=(\d+)\s+failed=(\d+)/
    )
    return NextResponse.json({
      ok: true,
      closed: m ? Number(m[1]) : undefined,
      reseeded: m ? Number(m[2]) : undefined,
      updated: m ? Number(m[3]) : undefined,
      failed: m ? Number(m[4]) : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/mlb-odds]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
