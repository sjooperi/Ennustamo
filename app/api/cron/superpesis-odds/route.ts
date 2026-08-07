import { NextResponse } from 'next/server'
import { runSportsScript } from '@/lib/run-sports-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Close Superpesis markets when game starts (open → closed). */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code, stdout, stderr } = await runSportsScript('sync-superpesis-odds.mjs')
    if (code !== 0) {
      console.error('[cron/superpesis-odds]', stderr || stdout)
      return NextResponse.json(
        { error: stderr || stdout || 'odds sync failed', code },
        { status: 500 }
      )
    }
    const m = stdout.match(/\[done\]\s+closed=(\d+)\s+updated=(\d+)\s+failed=(\d+)/)
    return NextResponse.json({
      ok: true,
      closed: m ? Number(m[1]) : undefined,
      updated: m ? Number(m[2]) : undefined,
      failed: m ? Number(m[3]) : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/superpesis-odds]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
