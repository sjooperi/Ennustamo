/** Re-export sports CLI helpers (MLB + Superpesis). */
export {
  parseResolveDone,
  runMlbScript,
  runSportsScript,
  type SportsScriptName,
} from '@/lib/run-sports-cli'

export type MlbScriptName = Extract<
  import('@/lib/run-sports-cli').SportsScriptName,
  'import-mlb-markets.mjs' | 'sync-mlb-odds.mjs' | 'resolve-mlb-markets.mjs'
>
