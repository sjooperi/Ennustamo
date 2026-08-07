'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { parseMarketOptions, parseOptionPools } from '@/lib/amm'
import {
  applyMarketChange,
  isListablePublicMarket,
  isOpenForBetting,
  isOpenMarketStatus,
  readMarketStatus,
  type MarketRow,
} from '@/lib/market-realtime'
import {
  buildPriceHistoryForMarket,
  chartSeriesForOptions,
  type MarketBet,
} from '@/lib/price-history'
import { supabase } from '@/lib/supabase'
import { MarketCard, type LiveMarket, type UserPosition } from '@/components/market-card'
import { CommunityCreateForm } from '@/components/community-create-form'
import {
  COMMUNITY_CATEGORY,
  isCommunityMarket,
  topCommunityMarketIds,
  topicCategoryOf,
  reportCommunityMarket,
  resolveCommunityMarket,
} from '@/lib/community'

const DEFAULT_STAKE = 0

function translateBetError(message: string): string {
  if (message.includes('UNAUTHORIZED')) return 'Kirjaudu sisään lyödäksesi vetoa.'
  if (message.includes('INSUFFICIENT_BALANCE')) return 'Saldo ei riitä.'
  if (message.includes('INVALID_CHOICE')) return 'Virheellinen valinta.'
  if (message.includes('INVALID_AMOUNT')) return 'Virheellinen panos.'
  if (message.includes('MARKET_NOT_FOUND')) return 'Kohdetta ei löytynyt.'
  if (message.includes('INVALID_SHARES')) return 'Panos on liian pieni tälle markkinalle.'
  if (message.includes('NO_POSITION')) return 'Ei nostettavaa positiota.'
  if (message.includes('MARKET_CLOSED')) return 'Kohde on suljettu — ottelu on alkanut tai ratkaistu.'
  if (message.includes('DAILY_LIMIT')) return 'Voit luoda enintään 2 kohdetta päivässä.'
  return message
}

function isListableMarket(row: MarketRow): boolean {
  return isListablePublicMarket(row)
}

function toLiveMarket(row: MarketRow): LiveMarket & { created_at?: string } {
  const options = parseMarketOptions(row.options)
  const optionPools = parseOptionPools(row.option_pools)
  // Keep binary pools in sync for display when option_pools missing
  if (
    options.length === 2 &&
    Object.keys(optionPools).length === 0 &&
    (row.yes_pool != null || row.no_pool != null)
  ) {
    optionPools.YES = Number(row.yes_pool || 0)
    optionPools.NO = Number(row.no_pool || 0)
  }

  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null
  const gameDate =
    typeof metadata?.game_date === 'string'
      ? metadata.game_date
      : typeof row.game_date === 'string'
        ? row.game_date
        : null

  return {
    id: row.id,
    title: String(row.title || ''),
    category: String(row.category || ''),
    subcategory: row.subcategory ? String(row.subcategory) : null,
    end_date: String(row.end_date || ''),
    yes_pool: Number(row.yes_pool || 0),
    no_pool: Number(row.no_pool || 0),
    status: row.status ?? null,
    options,
    option_pools: optionPools,
    metadata,
    game_date: gameDate,
    created_at: row.created_at ? String(row.created_at) : undefined,
    created_by: row.created_by ? String(row.created_by) : null,
    resolution_criteria: row.resolution_criteria
      ? String(row.resolution_criteria)
      : null,
    resolution_deadline: row.resolution_deadline
      ? String(row.resolution_deadline)
      : null,
    creator_stake: Number(row.creator_stake || 0),
    stake_status: row.stake_status ? String(row.stake_status) : null,
    total_volume: Number(row.total_volume || 0),
    topic_category: row.topic_category
      ? String(row.topic_category)
      : typeof metadata?.topic_category === 'string'
        ? metadata.topic_category
        : null,
  }
}

function formatGameDayHeading(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00Z`)
    return d.toLocaleDateString('fi-FI', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

export function MarketsSection() {
  const { user, ready, balance, openAuth, refreshProfile } = useAuth()
  const [markets, setMarkets] = useState<(LiveMarket & { created_at?: string })[]>([])
  const [userPositions, setUserPositions] = useState<Record<string, UserPosition[]>>({})
  const [loading, setLoading] = useState(true)
  const [bettingMarketId, setBettingMarketId] = useState<string | null>(null)
  const [sellingMarketId, setSellingMarketId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Suosituimmat')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [stakeByMarket, setStakeByMarket] = useState<Record<string, number>>({})
  const [marketBets, setMarketBets] = useState<Record<string, MarketBet[]>>({})
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [actionOk, setActionOk] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const marketsPromise = supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false })

      const userBetsPromise = user
        ? supabase
            .from('bets')
            .select('market_id, option, amount, shares')
            .eq('user_id', user.id)
        : Promise.resolve({
            data: [] as {
              market_id: string
              option: string
              amount: number
              shares: number
            }[],
            error: null,
          })

      const historyBetsPromise = supabase
        .from('bets')
        .select('market_id, option, amount, created_at')
        .order('created_at', { ascending: true })

      const [marketsResult, betsResult, historyResult] = await Promise.all([
        marketsPromise,
        userBetsPromise,
        historyBetsPromise,
      ])

      if (marketsResult.error) {
        if (
          marketsResult.error.message?.includes('status') ||
          marketsResult.error.code === '42703'
        ) {
          const fallback = await supabase
            .from('markets')
            .select('*')
            .order('created_at', { ascending: false })
          if (fallback.data) {
            setMarkets(
              fallback.data
                .filter((m) => isListableMarket(m as MarketRow))
                .map((m) => toLiveMarket(m as MarketRow))
            )
          }
        } else {
          console.error('Failed to load markets:', marketsResult.error.message)
        }
      } else if (marketsResult.data) {
        setMarkets(
          marketsResult.data
            .filter((m) => isListableMarket(m as MarketRow))
            .map((m) => toLiveMarket(m as MarketRow))
        )
      }

      if (betsResult.error) {
        if (betsResult.error.code !== 'PGRST205') {
          console.error('Failed to load bets:', betsResult.error.message)
        }
        setUserPositions({})
      } else if (betsResult.data) {
        const grouped: Record<string, UserPosition[]> = {}
        for (const bet of betsResult.data) {
          const choice = String(bet.option || '').toUpperCase() || 'YES'
          const list = grouped[bet.market_id] ?? []
          list.push({
            choice,
            amount: Number(bet.amount),
            shares: Number(bet.shares || 0),
          })
          grouped[bet.market_id] = list
        }
        setUserPositions(grouped)
      } else {
        setUserPositions({})
      }

      if (historyResult.error) {
        if (historyResult.error.code !== 'PGRST205') {
          console.error('Failed to load bet history:', historyResult.error.message)
        }
        setMarketBets({})
      } else if (historyResult.data) {
        const grouped: Record<string, MarketBet[]> = {}
        for (const bet of historyResult.data) {
          const list = grouped[bet.market_id] ?? []
          list.push({
            option: String(bet.option || ''),
            amount: Number(bet.amount),
            created_at: bet.created_at,
          })
          grouped[bet.market_id] = list
        }
        setMarketBets(grouped)
      } else {
        setMarketBets({})
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!ready) return
    void loadData()
  }, [loadData, ready])

  // Drop expired non-community markets from the open list
  useEffect(() => {
    if (!ready) return
    const tick = () => {
      const now = Date.now()
      setMarkets((prev) => {
        const next = prev.filter((m) => {
          if (isCommunityMarket(m)) {
            const s = String(m.status || 'open').toLowerCase()
            return s === 'open' || s === 'closed'
          }
          return isOpenForBetting(m, now)
        })
        return next.length === prev.length ? prev : next
      })
    }
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [ready])

  // Live updates: resolution removes market; rollback / pool changes patch list
  useEffect(() => {
    if (!ready) return

    const channel = supabase
      .channel('public-markets-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        (payload) => {
          const wasOpen =
            payload.eventType === 'INSERT'
              ? false
              : isOpenMarketStatus(readMarketStatus(payload.old))
          const isOpen =
            payload.eventType === 'DELETE'
              ? false
              : isOpenMarketStatus(readMarketStatus(payload.new))

          setMarkets((prev) => applyMarketChange(prev, payload, toLiveMarket))

          // Winner payouts / rollback — refresh Fyrkka balance
          if (user && wasOpen !== isOpen) {
            void refreshProfile()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bets' },
        (payload) => {
          const row = payload.new as {
            market_id?: string
            option?: string
            amount?: number
            created_at?: string
          }
          if (!row?.market_id) return

          setMarketBets((prev) => {
            const list = prev[row.market_id!] ?? []
            return {
              ...prev,
              [row.market_id!]: [
                ...list,
                {
                  option: String(row.option || ''),
                  amount: Number(row.amount || 0),
                  created_at: row.created_at || new Date().toISOString(),
                },
              ],
            }
          })
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime markets channel error:', err)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ready, user, refreshProfile])

  const getStake = (marketId: string) => stakeByMarket[marketId] ?? DEFAULT_STAKE

  const setStake = (marketId: string, value: number) => {
    setStakeByMarket((prev) => ({ ...prev, [marketId]: value }))
  }

  const handleBet = async (marketId: string, choice: string) => {
    setActionError(null)

    if (!user) {
      openAuth('login')
      return
    }

    const amount = getStake(marketId)
    if (!(amount > 0)) {
      setActionError('Syötä positiivinen panos.')
      return
    }

    if (amount > balance) {
      setActionError('Saldo ei riitä.')
      return
    }

    if (bettingMarketId || sellingMarketId) return

    setBettingMarketId(marketId)

    const { data, error } = await supabase.rpc('place_bet', {
      p_market_id: marketId,
      p_choice: choice.toUpperCase(),
      p_amount: amount,
    })

    if (error) {
      setActionError(translateBetError(error.message))
      setBettingMarketId(null)
      return
    }

    const shares = Number(data?.shares ?? 0)
    setUserPositions((prev) => ({
      ...prev,
      [marketId]: [
        ...(prev[marketId] ?? []),
        { choice: choice.toUpperCase(), amount, shares },
      ],
    }))
    setStakeByMarket((prev) => ({ ...prev, [marketId]: 0 }))

    await refreshProfile()
    setBettingMarketId(null)
    void loadData()
  }

  const handleSell = async (marketId: string, choice: string) => {
    setActionError(null)
    setActionOk(null)

    if (!user) {
      openAuth('login')
      return
    }

    if (bettingMarketId || sellingMarketId) return

    setSellingMarketId(marketId)

    const { data, error } = await supabase.rpc('sell_position', {
      p_market_id: marketId,
      p_choice: choice.toUpperCase(),
    })

    if (error) {
      setActionError(translateBetError(error.message))
      setSellingMarketId(null)
      return
    }

    const proceeds = Number(
      (data as { proceeds?: number } | null)?.proceeds ?? 0
    )
    const profit = Number((data as { profit?: number } | null)?.profit ?? 0)
    setActionOk(
      profit >= 0
        ? `Nostit ${proceeds.toLocaleString('fi-FI')} F (+${profit.toLocaleString('fi-FI')} F).`
        : `Nostit ${proceeds.toLocaleString('fi-FI')} F (${profit.toLocaleString('fi-FI')} F).`
    )

    await refreshProfile()
    setSellingMarketId(null)
    void loadData()
  }

  const handleResolveCommunity = async (marketId: string, winningOption: string) => {
    setActionError(null)
    setActionOk(null)
    setResolvingId(marketId)
    const result = await resolveCommunityMarket(marketId, winningOption)
    setResolvingId(null)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    setActionOk('Kohde ratkaistu. Pantti palautettu ja voitot maksettu.')
    await refreshProfile()
    void loadData()
  }

  const handleReportCommunity = async (marketId: string, reason: string) => {
    setActionError(null)
    setActionOk(null)
    if (!user) {
      openAuth('login')
      return
    }
    setReportingId(marketId)
    const result = await reportCommunityMarket(marketId, reason)
    setReportingId(null)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    if (result.removed) {
      setActionOk(
        'Kohde poistettiin raporttien perusteella. Vedot palautettiin pelaajille; luojan pantti takavarikoitiin.'
      )
      await refreshProfile()
    } else {
      setActionOk(`Raportti vastaanotettu (${result.reportCount}/5).`)
    }
    void loadData()
  }

  const POPULAR_TOP_N = 20

  const categories = [
    'Suosituimmat',
    'Yhteisö',
    'Politiikka',
    'Talous',
    'Urheilu',
    'Viihde',
    'Teknologia',
  ]

  const sportSubcategories = useMemo(() => {
    const set = new Set<string>()
    for (const m of markets) {
      if (m.category?.toLowerCase() === 'urheilu' && m.subcategory) {
        set.add(m.subcategory)
      }
    }
    if (!set.has('MLB')) set.add('MLB')
    if (!set.has('Superpesis')) set.add('Superpesis')
    return ['Kaikki', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'fi'))]
  }, [markets])

  const filteredMarkets = useMemo(() => {
    const topCommunity = topCommunityMarketIds(markets)
    let list = markets
    if (selectedCategory.toLowerCase() === 'suosituimmat') {
      list = list
        .filter((m) => isOpenForBetting(m))
        .sort(
          (a, b) => Number(b.total_volume || 0) - Number(a.total_volume || 0)
        )
        .slice(0, POPULAR_TOP_N)
    } else if (selectedCategory.toLowerCase() === 'yhteisö') {
      list = list.filter((market) => isCommunityMarket(market))
      list = [...list].sort(
        (a, b) => Number(b.total_volume || 0) - Number(a.total_volume || 0)
      )
    } else {
      const cat = selectedCategory.toLowerCase()
      list = list.filter((market) => {
        if (isCommunityMarket(market)) {
          if (!topCommunity.has(market.id)) return false
          const topic = (topicCategoryOf(market) || '').toLowerCase()
          return topic === cat
        }
        return market.category?.toLowerCase() === cat
      })
      // Non-community categories: only actively bettable
      list = list.filter((m) => isOpenForBetting(m))
    }
    if (
      selectedCategory.toLowerCase() === 'urheilu' &&
      selectedSubcategory &&
      selectedSubcategory !== 'Kaikki'
    ) {
      // Keep top community sports in Suosituimmat only; sport subfilters are official listings
      list = list.filter(
        (market) =>
          !isCommunityMarket(market) &&
          market.subcategory?.toLowerCase() === selectedSubcategory.toLowerCase()
      )
    }
    return list
  }, [markets, selectedCategory, selectedSubcategory])

  const sportDayGroups = useMemo(() => {
    const sub = selectedSubcategory?.toLowerCase()
    const isDayView =
      selectedCategory.toLowerCase() === 'urheilu' &&
      (sub === 'mlb' || sub === 'superpesis')
    if (!isDayView) return null

    const groups = new Map<string, typeof filteredMarkets>()
    for (const m of filteredMarkets) {
      const day =
        m.game_date ||
        (typeof m.metadata?.game_date === 'string' ? m.metadata.game_date : null) ||
        'muut'
      const arr = groups.get(day) || []
      arr.push(m)
      groups.set(day, arr)
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredMarkets, selectedCategory, selectedSubcategory])

  const renderMarketCard = (market: (typeof markets)[number]) => {
    const yesPool = Number(market.yes_pool || 0)
    const noPool = Number(market.no_pool || 0)
    const stake = getStake(market.id)
    const options = market.options ?? [
      { key: 'YES', label: 'Kyllä' },
      { key: 'NO', label: 'Ei' },
    ]
    const priceHistory = buildPriceHistoryForMarket({
      marketCreatedAt: market.created_at,
      options,
      bets: marketBets[market.id] ?? [],
      yesPool,
      noPool,
      optionPools: market.option_pools,
    })
    const chartSeries = chartSeriesForOptions(options)

    return (
      <MarketCard
        key={market.id}
        market={market}
        priceHistory={priceHistory}
        chartSeries={chartSeries}
        stake={stake}
        balance={balance}
        positions={userPositions[market.id] ?? []}
        isBetting={bettingMarketId === market.id}
        isSelling={sellingMarketId === market.id}
        isLoggedIn={!!user}
        currentUserId={user?.id}
        onStakeChange={(value) => setStake(market.id, value)}
        onBet={(choice) => handleBet(market.id, choice)}
        onSell={(choice) => handleSell(market.id, choice)}
        onLogin={() => openAuth('login')}
        onResolveCommunity={
          isCommunityMarket(market) ? handleResolveCommunity : undefined
        }
        onReportCommunity={
          isCommunityMarket(market) ? handleReportCommunity : undefined
        }
        isResolving={resolvingId === market.id}
        isReporting={reportingId === market.id}
      />
    )
  }

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden">
      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-[var(--no)]/30 bg-[var(--no)]/10 px-3 py-2 text-sm text-[var(--no)]"
        >
          {actionError}
        </div>
      )}
      {actionOk && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-[var(--yes)]/30 bg-[var(--yes)]/10 px-3 py-2 text-sm text-[var(--yes)]"
        >
          {actionOk}
        </div>
      )}

      <div className="mb-6 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat)
              setSelectedSubcategory(cat === 'Urheilu' ? 'Kaikki' : null)
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {selectedCategory === COMMUNITY_CATEGORY && (
        <CommunityCreateForm
          balance={balance}
          isLoggedIn={!!user}
          onLogin={() => openAuth('login')}
          onCreated={() => {
            void refreshProfile()
            void loadData()
          }}
        />
      )}

      {selectedCategory === 'Urheilu' && (
        <div className="mb-5 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sportSubcategories.map((sub) => (
            <button
              key={sub}
              onClick={() => setSelectedSubcategory(sub)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                (selectedSubcategory || 'Kaikki') === sub
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              {sub === 'Kaikki' ? 'Kaikki urheilu' : sub}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ladataan kohteita...
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Ei kohteita tässä kategoriassa.
        </div>
      ) : sportDayGroups ? (
        <div className="flex flex-col gap-6">
          {sportDayGroups.map(([day, dayMarkets]) => (
            <section key={day} className="flex flex-col gap-2.5">
              <h3 className="text-sm font-semibold capitalize text-foreground">
                {day === 'muut' ? 'Muut ottelut' : formatGameDayHeading(day)}
              </h3>
              <div className="grid w-full max-w-full grid-cols-1 gap-2.5 md:grid-cols-2">
                {dayMarkets.map((market) => renderMarketCard(market))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid w-full max-w-full grid-cols-1 gap-2.5 md:grid-cols-2">
          {filteredMarkets.map((market) => renderMarketCard(market))}
        </div>
      )}
    </div>
  )
}
