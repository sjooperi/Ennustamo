import { spawn } from 'node:child_process'
import path from 'node:path'

export type SportsScriptName =
  | 'import-mlb-markets.mjs'
  | 'sync-mlb-odds.mjs'
  | 'resolve-mlb-markets.mjs'
  | 'import-superpesis-markets.mjs'
  | 'sync-superpesis-odds.mjs'
  | 'resolve-superpesis-markets.mjs'

/**
 * Run a sports .mjs script as a child process.
 * Avoids Next/Vercel dynamic-import issues with scripts outside the bundle.
 */
export function runSportsScript(
  scriptName: SportsScriptName,
  args: string[] = [],
  options: { timeoutMs?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? 55_000
  const scriptPath = path.join(process.cwd(), 'scripts', scriptName)

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Sports script timeout: ${scriptName}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr })
    })
  })
}

/** @deprecated Prefer runSportsScript */
export const runMlbScript = runSportsScript

/** Parse `[done] resolved=N pending=M failed=F closedFirst=C` from resolve script. */
export function parseResolveDone(stdout: string): {
  resolved: number
  pending: number
  failed: number
  closedFirst: number
} | null {
  const m = stdout.match(
    /\[done\]\s+resolved=(\d+)\s+pending=(\d+)\s+failed=(\d+)\s+closedFirst=(\d+)/
  )
  if (!m) return null
  return {
    resolved: Number(m[1]),
    pending: Number(m[2]),
    failed: Number(m[3]),
    closedFirst: Number(m[4]),
  }
}
