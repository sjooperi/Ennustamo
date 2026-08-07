import { NextResponse } from 'next/server'
import { parseResolveDone, runSportsScript } from '@/lib/run-sports-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Auto-resolve finished Superpesis games from Pesistulokset. */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code, stdout, stderr } = await runSportsScript(
      'resolve-superpesis-markets.mjs'
    )
    const stats = parseResolveDone(stdout)
    if (code !== 0) {
      console.error('[cron/superpesis-resolve]', stderr || stdout)
      return NextResponse.json(
        { error: stderr || stdout || 'resolve failed', code, ...stats },
        { status: 500 }
      )
    }
    return NextResponse.json({
      ok: true,
      ...(stats || { resolved: 0, pending: 0, failed: 0 }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/superpesis-resolve]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
