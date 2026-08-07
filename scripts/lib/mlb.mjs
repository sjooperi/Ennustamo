/**
 * Shared MLB helpers: Polymarket Gamma + MLB Stats API.
 */

export const GAMMA = 'https://gamma-api.polymarket.com'
export const MLB_STATS = 'https://statsapi.mlb.com/api/v1'
export const MLB_SERIES_ID = '3'
export const POOL_TOTAL = 200
/** Alkuprosentti: 3 prosenttiyksikköä pois Polymarketista (lukitaan tuonnissa) */
export const POLY_SKEW = 0.03
/** Arvioitu ottelun kesto päättymisajalle (ei tiedetä etukäteen tarkkaa loppua) */
export const GAME_DURATION_MS = 3.5 * 60 * 60 * 1000

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** CPMM: yesPrice = no/(yes+no). Seed pools for target YES probability. */
export function poolsFromYesProb(yesProb, total = POOL_TOTAL) {
  const p = clamp(Number(yesProb) || 0.5, 0.05, 0.95)
  return {
    yesSeed: Math.round((1 - p) * total * 100) / 100,
    noSeed: Math.round(p * total * 100) / 100,
    openingYesProb: p,
  }
}

/** Opening odds: Polymarket + 3pp on first outcome (away / YES). */
export function skewedOpeningProb(polyYesProb) {
  const poly = clamp(Number(polyYesProb) || 0.5, 0.01, 0.99)
  return clamp(poly + POLY_SKEW, 0.05, 0.95)
}

export function isMlbLiveStatus(status) {
  const abstract = String(status?.abstractGameState || '').toLowerCase()
  const detailed = String(status?.detailedState || '').toLowerCase()
  if (abstract === 'live') return true
  return /in progress|warmup|manager challenge|review|delayed/.test(detailed)
}

export function isMlbFinalStatus(status) {
  const abstract = String(status?.abstractGameState || '').toLowerCase()
  const detailed = String(status?.detailedState || '').toLowerCase()
  if (abstract === 'final') return true
  return /^final/.test(detailed) || detailed.includes('game over')
}

export function estimateGameEndIso(gameStartIso) {
  const start = new Date(gameStartIso)
  if (Number.isNaN(start.getTime())) return null
  return new Date(start.getTime() + GAME_DURATION_MS).toISOString()
}

/**
 * Fetch MLB schedule games for given YYYY-MM-DD dates (ET calendar).
 * @returns {Promise<Array<{gamePk, officialDate, gameStart, away, home, status, live, final}>>}
 */
export async function fetchMlbScheduleForDates(isoDates) {
  const unique = [...new Set(isoDates.filter(Boolean))]
  const games = []
  for (const date of unique) {
    try {
      const data = await fetchJson(
        `${MLB_STATS}/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=linescore`
      )
      for (const day of data?.dates || []) {
        for (const g of day.games || []) {
          const status = g.status || {}
          games.push({
            gamePk: g.gamePk,
            officialDate: g.officialDate || date,
            gameStart: g.gameDate || null,
            away: g?.teams?.away?.team?.name || '',
            home: g?.teams?.home?.team?.name || '',
            status,
            live: isMlbLiveStatus(status),
            final: isMlbFinalStatus(status),
            awayScore: g?.teams?.away?.score ?? null,
            homeScore: g?.teams?.home?.score ?? null,
          })
        }
      }
    } catch (err) {
      console.warn(`[mlb-schedule] ${date}:`, err instanceof Error ? err.message : err)
    }
  }
  return games
}

export function findScheduleGame(scheduleGames, { gameDate, away, home }) {
  const candidates = scheduleGames.filter((g) => g.officialDate === gameDate || !gameDate)
  for (const g of candidates) {
    if (teamsMatch(away, g.away) && teamsMatch(home, g.home)) return g
  }
  for (const g of candidates) {
    if (
      (teamsMatch(away, g.away) || teamsMatch(away, g.home)) &&
      (teamsMatch(home, g.away) || teamsMatch(home, g.home))
    ) {
      return g
    }
  }
  return null
}

export function gameDateFromSlug(slug) {
  const m = String(slug || '').match(/(\d{4}-\d{2}-\d{2})$/)
  return m ? m[1] : null
}

export function normalizeTeam(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(of|the|baseball|club|fc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function teamsMatch(a, b) {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const ta = na.split(' ')
  const tb = nb.split(' ')
  const lastA = ta[ta.length - 1]
  const lastB = tb[tb.length - 1]
  return lastA.length >= 4 && lastA === lastB
}

export async function fetchJson(url, { timeoutMs = 25000 } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'EnnustamoMlbBot/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`)
  }
  return res.json()
}

export async function fetchMlbSeriesEvents({ closed = false, limit = 100, offset = 0 } = {}) {
  const params = new URLSearchParams({
    series_id: MLB_SERIES_ID,
    closed: String(closed),
    active: closed ? 'false' : 'true',
    limit: String(limit),
    offset: String(offset),
  })
  const data = await fetchJson(`${GAMMA}/events?${params}`)
  return Array.isArray(data) ? data : []
}

export function pickMoneylineMarket(event) {
  const markets = Array.isArray(event?.markets) ? event.markets : []
  const byType = markets.find(
    (m) => String(m.sportsMarketType || '').toLowerCase() === 'moneyline'
  )
  if (byType) return byType
  const title = String(event?.title || '').trim()
  return markets.find((m) => String(m.question || '').trim() === title) || null
}

/**
 * Parse a Polymarket MLB event into an importable moneyline game.
 * Returns null if not a dated moneyline matchup.
 */
export function parseMlbMoneylineEvent(event) {
  const slug = event?.slug || ''
  const gameDate = gameDateFromSlug(slug)
  if (!gameDate) return null
  if (!/^mlb-/i.test(slug)) return null

  const market = pickMoneylineMarket(event)
  if (!market || market.closed) return null

  const outcomes = parseJsonArray(market.outcomes)
  const prices = parseJsonArray(market.outcomePrices).map(Number)
  if (outcomes.length < 2 || prices.length < 2) return null
  if (!Number.isFinite(prices[0]) || !Number.isFinite(prices[1])) return null

  const away = String(outcomes[0]).trim()
  const home = String(outcomes[1]).trim()
  if (!away || !home) return null

  const polyYes = prices[0]
  const openingYes = skewedOpeningProb(polyYes)
  const pools = poolsFromYesProb(openingYes)

  // Polymarket endDate is often far in the future — prefer game-day estimate later
  const polyEnd = market.endDate || event.endDate || null

  return {
    eventId: String(event.id),
    marketId: String(market.id),
    slug,
    gameDate,
    title: `${away} vs ${home}`,
    away,
    home,
    endDate: polyEnd,
    polyYes,
    polyNo: prices[1],
    openingYes: pools.openingYesProb,
    yesSeed: pools.yesSeed,
    noSeed: pools.noSeed,
    externalId: `polymarket:mlb:${event.id}`,
  }
}

/**
 * Enrich parsed Polymarket games with MLB start/end times and live flags.
 */
export function enrichGamesWithSchedule(games, scheduleGames) {
  return games.map((g) => {
    const sched = findScheduleGame(scheduleGames, {
      gameDate: g.gameDate,
      away: g.away,
      home: g.home,
    })
    if (!sched) return { ...g, live: false, gameStart: null }
    const endDate = sched.gameStart || g.endDate
    return {
      ...g,
      gameStart: sched.gameStart,
      endDate,
      live: sched.live,
      final: sched.final,
      mlbGamePk: sched.gamePk,
      mlbStatus: sched.status?.detailedState || null,
    }
  })
}

export async function fetchPolymarketEvent(eventId) {
  return fetchJson(`${GAMMA}/events/${eventId}`)
}

export function moneylinePricesFromEvent(event) {
  const market = pickMoneylineMarket(event)
  if (!market) return null
  const outcomes = parseJsonArray(market.outcomes)
  const prices = parseJsonArray(market.outcomePrices).map(Number)
  if (outcomes.length < 2 || prices.length < 2) return null
  if (!Number.isFinite(prices[0]) || !Number.isFinite(prices[1])) return null
  return {
    market,
    outcomes,
    polyYes: prices[0],
    polyNo: prices[1],
    closed: Boolean(market.closed || event.closed),
  }
}

export function winnerFromPolyPrices(outcomes, prices) {
  const o = parseJsonArray(outcomes)
  const p = parseJsonArray(prices).map(Number)
  if (o.length < 2 || p.length < 2) return null
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null
  // Decisive: one side ~1
  if (p[0] >= 0.95 && p[1] <= 0.05) return { team: o[0], source: 'polymarket' }
  if (p[1] >= 0.95 && p[0] <= 0.05) return { team: o[1], source: 'polymarket' }
  return null
}

export async function fetchMlbFinalsForDate(isoDate) {
  const data = await fetchJson(
    `${MLB_STATS}/schedule?sportId=1&date=${encodeURIComponent(isoDate)}&hydrate=linescore`
  )
  const dates = data?.dates || []
  const games = []
  for (const day of dates) {
    for (const g of day.games || []) {
      const status = g?.status || {}
      if (!isMlbFinalStatus(status)) continue
      const away = g?.teams?.away?.team?.name
      const home = g?.teams?.home?.team?.name
      const awayScore = g?.teams?.away?.score
      const homeScore = g?.teams?.home?.score
      if (away == null || home == null || awayScore == null || homeScore == null) continue
      if (awayScore === homeScore) continue // ignore ties / extras weirdness
      games.push({
        gamePk: g.gamePk,
        away,
        home,
        awayScore,
        homeScore,
        winner: awayScore > homeScore ? away : home,
      })
    }
  }
  return games
}

export function matchMlbWinner(awayLabel, homeLabel, finals) {
  for (const g of finals) {
    const awayOk =
      teamsMatch(awayLabel, g.away) || teamsMatch(homeLabel, g.away)
    const homeOk =
      teamsMatch(homeLabel, g.home) || teamsMatch(awayLabel, g.home)
    // Prefer correct home/away alignment
    if (teamsMatch(awayLabel, g.away) && teamsMatch(homeLabel, g.home)) {
      const winnerIsAway = g.winner === g.away
      if (winnerIsAway && teamsMatch(awayLabel, g.away)) return { team: awayLabel, source: 'mlb_stats', gamePk: g.gamePk }
      if (!winnerIsAway && teamsMatch(homeLabel, g.home)) return { team: homeLabel, source: 'mlb_stats', gamePk: g.gamePk }
    }
    if (awayOk && homeOk) {
      if (teamsMatch(awayLabel, g.winner) || teamsMatch(g.winner, awayLabel)) {
        return { team: awayLabel, source: 'mlb_stats', gamePk: g.gamePk }
      }
      if (teamsMatch(homeLabel, g.winner) || teamsMatch(g.winner, homeLabel)) {
        return { team: homeLabel, source: 'mlb_stats', gamePk: g.gamePk }
      }
    }
  }
  return null
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

/** Inclusive date window: today (UTC or Helsinki) ± days ahead. */
export function dateWindow({ daysAhead = 2, timeZone = 'America/New_York' } = {}) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const out = []
  const now = new Date()
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(now.getTime() + i * 86400000)
    out.push(fmt.format(d)) // YYYY-MM-DD
  }
  return out
}
