import { NextResponse } from 'next/server'
import { runMlbScript } from '@/lib/run-mlb-cli'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code, stdout, stderr } = await runMlbScript('import-mlb-markets.mjs')
    if (code !== 0) {
      console.error('[cron/mlb-import]', stderr || stdout)
      return NextResponse.json(
        { error: stderr || stdout || 'import failed', code },
        { status: 500 }
      )
    }
    const m = stdout.match(/\[done\]\s+tuotu\s+(\d+),\s+skip\s+(\d+)/)
    return NextResponse.json({
      ok: true,
      imported: m ? Number(m[1]) : undefined,
      skipped: m ? Number(m[2]) : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cron/mlb-import]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
