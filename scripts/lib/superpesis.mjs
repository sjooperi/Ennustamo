/**
 * Superpesis helpers: Pesistulokset (ottelut/tulokset) + OddsPortal (kertoimet).
 */

import crypto from 'node:crypto'
import zlib from 'node:zlib'

export const PESISTULOKSET = 'https://api.pesistulokset.fi/api/v1'
/** Miesten Superpesis 2026 */
export const SEASON_SERIES_MEN = 2945
/** Naisten Superpesis 2026 */
export const SEASON_SERIES_WOMEN = 2946

export const ODDS_PORTAL_PAGE =
  'https://www.oddsportal.com/pesapallo/finland/superpesis/'
export const FLASHSCORE_FIXTURES =
  'https://www.flashscore.com/pesapallo/finland/superpesis/fixtures/'
export const ODDS_PORTAL_SPORT = 30
export const ODDS_PORTAL_TOURNAMENT = '4v47NH2C'

/** Frontend-JS:stä (OddsPortal) — AES-CBC + PBKDF2 */
const OP_PASS = 'J*8sQ!p$7aD_fR2yW@gHn*3bVp#sAdLd_k'
const OP_SALT = '5b9a8f2c3e6d1a4b7c8e9d0f1a2b3c4d'

export const POOL_TOTAL = 200
/** Pieni skew avaukseen vs. fair-kerroin (kuten MLB) */
export const BOOK_SKEW = 0.02
export const GAME_DURATION_MS = 3 * 60 * 60 * 1000

const UA = 'EnnustamoSuperpesisBot/1.0'

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

export function poolsFromYesProb(yesProb, total = POOL_TOTAL) {
  const p = clamp(Number(yesProb) || 0.5, 0.05, 0.95)
  return {
    yesSeed: Math.round((1 - p) * total * 100) / 100,
    noSeed: Math.round(p * total * 100) / 100,
    openingYesProb: p,
  }
}

export function skewedOpeningProb(fairYes) {
  const fair = clamp(Number(fairYes) || 0.5, 0.01, 0.99)
  return clamp(fair + BOOK_SKEW, 0.05, 0.95)
}

export function estimateGameEndIso(gameStartIso) {
  const start = new Date(gameStartIso)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + GAME_DURATION_MS).toISOString()
}

export function normalizeTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(pesis|urheilijat|ankkurit|maila|pallonlyojat|pallo|veikot|kiri|jymy|tahko|veto|manse|kou|kpl|ipv|kipa|sojy|pattu|keki|vive|joma)\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function teamsMatch(a, b) {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = na.split(' ').filter(Boolean)
  const tb = nb.split(' ').filter(Boolean)
  if (ta[0] && tb[0] && ta[0] === tb[0] && ta[0].length >= 4) return true
  const lastA = ta[ta.length - 1]
  const lastB = tb[tb.length - 1]
  return lastA.length >= 4 && lastA === lastB
}

export async function fetchText(url, { headers = {}, timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.text()
}

export async function fetchJson(url, { headers = {}, timeoutMs = 30000 } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

export function dateWindow({ daysAhead = 2, timeZone = 'Europe/Helsinki' } = {}) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const out = []
  const now = new Date()
  for (let i = 0; i <= daysAhead; i++) {
    out.push(fmt.format(new Date(now.getTime() + i * 86400000)))
  }
  return out
}

function helsinkiDate(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

function mapFromList(list) {
  const out = new Map()
  for (const e of list || []) {
    if (e && e.id != null) out.set(e.id, e.value || e)
  }
  return out
}

/**
 * Fetch all matches for a seasonSeries from Pesistulokset.
 */
export async function fetchPesistuloksetMatches(seasonSeriesId) {
  let url = `${PESISTULOKSET}/matches?type=all&seasonSeries=${seasonSeriesId}`
  const matches = []
  const teams = new Map()

  while (url) {
    const data = await fetchJson(url)
    for (const [id, value] of mapFromList(data?.maps?.team)) {
      teams.set(id, value)
    }
    for (const m of data?.data || []) matches.push(m)
    url = data?.has_more ? data.next_page : null
  }

  return { matches, teams }
}

export function teamName(teams, id) {
  const t = teams.get(id)
  if (!t) return String(id)
  return t.name || t.shorthand || String(id)
}

/**
 * Winner of a finished pesäpallo match (periods → superpesä → kotiutuskilpailu).
 */
export function winnerFromPesistulos(result, homeName, awayName) {
  if (!result) return null
  const ph = result.periods_home
  const pa = result.periods_away
  if (ph == null || pa == null) return null
  if (Number(ph) > Number(pa)) return { team: homeName, source: 'pesistulokset' }
  if (Number(pa) > Number(ph)) return { team: awayName, source: 'pesistulokset' }

  const sh = result.runs_home_super_inning
  const sa = result.runs_away_super_inning
  if (sh != null && sa != null && Number(sh) !== Number(sa)) {
    return {
      team: Number(sh) > Number(sa) ? homeName : awayName,
      source: 'pesistulokset',
    }
  }

  const ch = result.runs_home_scoring_contest
  const ca = result.runs_away_scoring_contest
  if (ch != null && ca != null && Number(ch) !== Number(ca)) {
    return {
      team: Number(ch) > Number(ca) ? homeName : awayName,
      source: 'pesistulokset',
    }
  }
  return null
}

export function isMatchFinished(match) {
  if (!match || match.canceled || match.invalidated) return false
  if (match.live) return false
  const r = match.result
  if (!r) return false
  return r.periods_home != null && r.periods_away != null
}

export function isMatchLive(match) {
  return Boolean(match?.live)
}

export function findPesistulosMatch(matches, teams, { gameDate, away, home }) {
  const candidates = matches.filter((m) => {
    const d = helsinkiDate(m.date)
    return !gameDate || d === gameDate
  })
  for (const m of candidates) {
    const h = teamName(teams, m.home)
    const a = teamName(teams, m.away)
    if (teamsMatch(home, h) && teamsMatch(away, a)) return m
  }
  for (const m of candidates) {
    const h = teamName(teams, m.home)
    const a = teamName(teams, m.away)
    if (
      (teamsMatch(home, h) || teamsMatch(home, a)) &&
      (teamsMatch(away, h) || teamsMatch(away, a))
    ) {
      return m
    }
  }
  return null
}

/** Decimal odds → fair 2-way YES (away) probability, draw removed + de-vig. */
export function fairAwayProbFromDecimal(homeOdds, awayOdds, drawOdds = null) {
  const h = Number(homeOdds)
  const a = Number(awayOdds)
  if (!(h > 1) || !(a > 1)) return null
  let ih = 1 / h
  let ia = 1 / a
  if (drawOdds && Number(drawOdds) > 1) {
    // Drop draw mass; renormalize home/away
    const id = 1 / Number(drawOdds)
    const sum = ih + ia + id
    ih /= sum
    ia /= sum
    const two = ih + ia
    return clamp(ia / two, 0.05, 0.95)
  }
  const sum = ih + ia
  return clamp(ia / sum, 0.05, 0.95)
}

function decryptOddsPortalPayload(b64) {
  const utf8 = Buffer.from(String(b64).trim(), 'base64').toString('utf8')
  const [cipherB64, ivHex] = utf8.split(':')
  if (!cipherB64 || !ivHex) throw new Error('OddsPortal: invalid encrypted payload')
  const key = crypto.pbkdf2Sync(OP_PASS, OP_SALT, 1000, 32, 'sha256')
  const iv = Buffer.from(ivHex, 'hex')
  const data = Buffer.from(cipherB64, 'base64')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let out = Buffer.concat([decipher.update(data), decipher.final()])
  if (out[0] === 0x1f && out[1] === 0x8b) out = zlib.gunzipSync(out)
  return JSON.parse(out.toString('utf8'))
}

/**
 * Parse 1X2 avg odds from OddsPortal oddsData entry.
 * Array order: home, draw, away (standard).
 */
export function parsePortal1x2(oddsEntry) {
  const rows = Array.isArray(oddsEntry?.odds) ? oddsEntry.odds : []
  if (rows.length < 2) return null
  const byIndex = rows.map((r) => Number(r.avgOdds || r.maxOdds)).filter((n) => n > 1)
  if (byIndex.length >= 3) {
    return { home: byIndex[0], draw: byIndex[1], away: byIndex[2] }
  }
  if (byIndex.length === 2) {
    return { home: byIndex[0], draw: null, away: byIndex[1] }
  }
  return null
}

/** Extract xhash bitmask from OddsPortal tournament page. */
export function extractOddsPortalXhash(html) {
  const escaped = html.match(
    /ajax-sport-country-tournament_\\\/30\\\/4v47NH2C\\\/([^\\]+)\\\/1\\\//
  )
  if (escaped?.[1]) return escaped[1]
  const plain = html.match(
    /ajax-sport-country-tournament_\/30\/4v47NH2C\/([^/]+)\/1\//
  )
  return plain?.[1] || null
}

/**
 * Parse upcoming/recent events from OddsPortal HTML (embedded feed fragments).
 * Returns { id, home, away, startUnix, startIso }[]
 */
export function parseOddsPortalEventsFromHtml(html) {
  const parts = String(html).split(/~AA÷/)
  const out = []
  for (const part of parts.slice(1)) {
    const fields = Object.fromEntries(
      [...('AA÷' + part.slice(0, 4000)).matchAll(/([A-Za-z0-9]{1,4})÷([^¬]*)/g)].map(
        (m) => [m[1], m[2]]
      )
    )
    const id = fields.AA
    const home = fields.AE
    const away = fields.AF
    const startUnix = Number(fields.AD)
    if (!id || !home || !away || !Number.isFinite(startUnix)) continue
    out.push({
      id,
      home,
      away,
      startUnix,
      startIso: new Date(startUnix * 1000).toISOString(),
      status: fields.AB, // 1 = scheduled
    })
  }
  return out
}

/**
 * Fetch Superpesis book odds (OddsPortal) + event list (Flashscore fixtures).
 * Event IDs are shared across Livesport/Flashscore/OddsPortal.
 */
export async function fetchOddsPortalSuperpesisOdds() {
  const [portalHtml, fixturesHtml] = await Promise.all([
    fetchText(ODDS_PORTAL_PAGE, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }),
    fetchText(FLASHSCORE_FIXTURES, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
    }),
  ])

  const xhash =
    extractOddsPortalXhash(portalHtml) ||
    'X327712X0X0X0X0X0X0X0X0X0X0X0X0X134217728X0X0X0X0X0X32X512X32X0X0X0X0X0X0X0X536870912X2560X2048X0X33554560X0X0X0X0X524288X8388608X0X0X512'

  // Fixtures page has upcoming AA÷ events; portal page often does not
  const fromFixtures = parseOddsPortalEventsFromHtml(fixturesHtml)
  const fromPortal = parseOddsPortalEventsFromHtml(portalHtml)
  const byKey = new Map()
  for (const ev of [...fromPortal, ...fromFixtures]) byKey.set(ev.id, ev)
  const events = [...byKey.values()]

  const ajaxUrl = `https://www.oddsportal.com/ajax-sport-country-tournament_/${ODDS_PORTAL_SPORT}/${ODDS_PORTAL_TOURNAMENT}/${xhash}/1/?_=${Date.now()}`
  const enc = await fetchText(ajaxUrl, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: ODDS_PORTAL_PAGE,
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  const payload = decryptOddsPortalPayload(enc)
  const oddsData = payload?.d?.oddsData || {}
  const byId = new Map()
  for (const [id, entry] of Object.entries(oddsData)) {
    const parsed = parsePortal1x2(entry)
    if (!parsed) continue
    byId.set(id, { ...parsed, portalEventId: id, numericId: entry.event })
  }
  return { events, oddsById: byId, xhash }
}

/**
 * Build importable games for a date window.
 * YES = away (kuten MLB).
 */
export async function buildSuperpesisGames({ daysAhead = 2, seasonSeriesIds = [SEASON_SERIES_MEN] } = {}) {
  const allowed = new Set(dateWindow({ daysAhead }))
  const { events, oddsById } = await fetchOddsPortalSuperpesisOdds()

  const allOfficial = []
  const teamMaps = new Map()
  for (const ss of seasonSeriesIds) {
    const { matches, teams } = await fetchPesistuloksetMatches(ss)
    teamMaps.set(ss, teams)
    for (const m of matches) {
      allOfficial.push({ match: m, seasonSeriesId: ss, teams })
    }
  }

  const games = []
  for (const ev of events) {
    const gameDate = helsinkiDate(ev.startIso)
    if (!allowed.has(gameDate)) continue
    // Skip clearly finished on portal
    if (ev.status && ev.status !== '1' && Date.parse(ev.startIso) < Date.now() - 3600_000) {
      continue
    }
    if (Date.parse(ev.startIso) <= Date.now()) continue

    const odds = oddsById.get(ev.id)
    if (!odds) continue

    const fairAway = fairAwayProbFromDecimal(odds.home, odds.away, odds.draw)
    if (fairAway == null) continue
    const openingYes = skewedOpeningProb(fairAway)
    const pools = poolsFromYesProb(openingYes)

    // Prefer official Pesistulokset identity
    let official = null
    let seriesId = SEASON_SERIES_MEN
    for (const row of allOfficial) {
      const hit = findPesistulosMatch([row.match], row.teams, {
        gameDate,
        away: ev.away,
        home: ev.home,
      })
      if (hit) {
        official = hit
        seriesId = row.seasonSeriesId
        break
      }
    }

    const home = official
      ? teamName(teamMaps.get(seriesId), official.home)
      : ev.home
    const away = official
      ? teamName(teamMaps.get(seriesId), official.away)
      : ev.away
    const gameStart = official?.date || ev.startIso
    const matchId = official?.id || ev.id

    games.push({
      externalId: `book:superpesis:${matchId}`,
      title: `${away} vs ${home}`,
      away,
      home,
      gameDate,
      gameStart,
      endDate: gameStart,
      series: seriesId === SEASON_SERIES_WOMEN ? 'naiset' : 'miehet',
      seasonSeriesId: seriesId,
      pesistuloksetId: official?.id || null,
      portalEventId: ev.id,
      bookHome: odds.home,
      bookDraw: odds.draw,
      bookAway: odds.away,
      fairAway,
      openingYes: pools.openingYesProb,
      yesSeed: pools.yesSeed,
      noSeed: pools.noSeed,
    })
  }

  // Dedupe by externalId
  const seen = new Set()
  return games.filter((g) => {
    if (seen.has(g.externalId)) return false
    seen.add(g.externalId)
    return true
  })
}

export function optionKeyForTeam(options, teamName) {
  const list = Array.isArray(options) ? options : []
  for (const opt of list) {
    const key = String(opt.key || '').toUpperCase()
    const label = String(opt.label || '')
    if (teamsMatch(label, teamName)) return key
  }
  return null
}
